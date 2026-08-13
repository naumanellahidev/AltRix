import logging
import json
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError
from app.cache import get_redis

logger = logging.getLogger("app.vps_db")
router = APIRouter(prefix="/vps-db", tags=["Generic DB Proxy"])

class QueryFilter(BaseModel):
    method: str
    args: List[Any]

class QueryPayload(BaseModel):
    table: str
    action: Optional[str] = None
    select: Optional[str] = "*"
    filters: List[QueryFilter] = Field(default_factory=list)
    payload: Optional[Any] = None

def is_valid_identifier(name: str) -> bool:
    return name.isidentifier() and not name.startswith("_")

GLOBAL_TABLES = {
    "users",
    "schools",
    "system_settings",
    "global_metrics",
    "ai_providers"
}

async def broadcast_mutation(table: str, action: str, school_id: Optional[Any], data: Any):
    try:
        redis = await get_redis()
        if redis:
            event_payload = {
                "event_name": "postgres_changes",
                "school_id": str(school_id) if school_id else None,
                "table": table,
                "action": action,
                "data": data
            }
            await redis.publish("altrix:realtime:events", json.dumps(event_payload))
            logger.info(f"Broadcasted database proxy mutation: table={table}, action={action}")
    except Exception as redis_err:
        logger.error(f"Failed to broadcast database proxy mutation to Redis: {redis_err}")

@router.post("/query")
async def execute_query(query: QueryPayload, current_user: CurrentUser, db: DbSession):
    if not is_valid_identifier(query.table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    col_query = text("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :table")
    res = await db.execute(col_query, {"table": query.table})
    valid_columns = {row[0] for row in res.fetchall()}

    if not valid_columns:
        raise HTTPException(status_code=404, detail=f"Table {query.table} not found")

    has_school_id = "school_id" in valid_columns
    
    if not current_user.is_super_admin:
        if has_school_id:
            pass
        elif query.table not in GLOBAL_TABLES:
            if query.action in ("insert", "update", "delete"):
                logger.warning(f"Tenant {current_user.school_id} modifying global table {query.table}")

    action = query.action or "select"
    params: Dict[str, Any] = {}
    where_clauses = []
    
    if has_school_id and not current_user.is_super_admin:
        where_clauses.append("school_id = :__tenant_id")
        params["__tenant_id"] = current_user.school_id

    for i, f in enumerate(query.filters):
        if not f.args:
            continue
        col = f.args[0]
        if not is_valid_identifier(col) or col not in valid_columns:
            raise HTTPException(status_code=400, detail=f"Invalid column {col}")
            
        param_name = f"p_{i}"
        
        if f.method == "eq":
            where_clauses.append(f"{col} = :{param_name}")
            params[param_name] = f.args[1]
        elif f.method == "neq":
            where_clauses.append(f"{col} != :{param_name}")
            params[param_name] = f.args[1]
        elif f.method == "gt":
            where_clauses.append(f"{col} > :{param_name}")
            params[param_name] = f.args[1]
        elif f.method == "lt":
            where_clauses.append(f"{col} < :{param_name}")
            params[param_name] = f.args[1]
        elif f.method == "gte":
            where_clauses.append(f"{col} >= :{param_name}")
            params[param_name] = f.args[1]
        elif f.method == "lte":
            where_clauses.append(f"{col} <= :{param_name}")
            params[param_name] = f.args[1]
        elif f.method in ("in", "in_"):
            where_clauses.append(f"{col} = ANY(:{param_name})")
            params[param_name] = f.args[1]
        elif f.method == "is":
            if f.args[1] is None:
                where_clauses.append(f"{col} IS NULL")
            else:
                where_clauses.append(f"{col} = :{param_name}")
                params[param_name] = f.args[1]
        elif f.method in ("like", "ilike"):
            op = "ILIKE" if f.method == "ilike" else "LIKE"
            where_clauses.append(f"{col} {op} :{param_name}")
            params[param_name] = f.args[1]

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    if action == "select":
        select_clause = query.select if query.select and query.select != "" else "*"
        if "(" in select_clause: 
            select_clause = "*"
            
        sql = f'SELECT {select_clause} FROM "{query.table}"{where_sql}'
        try:
            res = await db.execute(text(sql), params)
            rows = [dict(r._mapping) for r in res.fetchall()]
            return {"data": rows, "error": None}
        except Exception as e:
            logger.error(f"DB Proxy Select Error: {e}")
            return {"data": None, "error": {"message": str(e)}}

    elif action == "insert":
        if not isinstance(query.payload, (dict, list)):
            return {"data": None, "error": {"message": "Invalid payload format"}}
            
        items = query.payload if isinstance(query.payload, list) else [query.payload]
        if not items:
            return {"data": [], "error": None}
            
        keys = list(items[0].keys())
        for k in keys:
            if not is_valid_identifier(k) or k not in valid_columns:
                return {"data": None, "error": {"message": f"Invalid column {k}"}}
                
        if has_school_id and not current_user.is_super_admin:
            for item in items:
                item["school_id"] = str(current_user.school_id)
                if "school_id" not in keys:
                    keys.append("school_id")
                    
        inserted_rows = []
        for item in items:
            cols = ", ".join(f'"{k}"' for k in keys)
            vals = ", ".join(f":{k}" for k in keys)
            sql = f'INSERT INTO "{query.table}" ({cols}) VALUES ({vals}) RETURNING *'
            try:
                res = await db.execute(text(sql), item)
                inserted_rows.append(dict(res.fetchone()._mapping))
            except Exception as e:
                logger.error(f"DB Proxy Insert Error: {e}")
                return {"data": None, "error": {"message": str(e)}}
                
        await db.flush()
        await broadcast_mutation(query.table, "insert", current_user.school_id, inserted_rows)
        return {"data": inserted_rows, "error": None}

    elif action == "update":
        if not isinstance(query.payload, dict):
            return {"data": None, "error": {"message": "Payload must be object for update"}}
            
        updates = []
        for k, v in query.payload.items():
            if not is_valid_identifier(k) or k not in valid_columns:
                return {"data": None, "error": {"message": f"Invalid column {k}"}}
            if k == "school_id" and not current_user.is_super_admin:
                continue 
            updates.append(f'"{k}" = :u_{k}')
            params[f"u_{k}"] = v
            
        if not updates:
            return {"data": None, "error": {"message": "No valid columns to update"}}
            
        set_sql = ", ".join(updates)
        sql = f'UPDATE "{query.table}" SET {set_sql}{where_sql} RETURNING *'
        try:
            res = await db.execute(text(sql), params)
            rows = [dict(r._mapping) for r in res.fetchall()]
            await db.flush()
            await broadcast_mutation(query.table, "update", current_user.school_id, rows)
            return {"data": rows, "error": None}
        except Exception as e:
            logger.error(f"DB Proxy Update Error: {e}")
            return {"data": None, "error": {"message": str(e)}}

    elif action == "delete":
        sql = f'DELETE FROM "{query.table}"{where_sql} RETURNING *'
        try:
            res = await db.execute(text(sql), params)
            rows = [dict(r._mapping) for r in res.fetchall()]
            await db.flush()
            await broadcast_mutation(query.table, "delete", current_user.school_id, rows)
            return {"data": rows, "error": None}
        except Exception as e:
            logger.error(f"DB Proxy Delete Error: {e}")
            return {"data": None, "error": {"message": str(e)}}

    return {"data": None, "error": {"message": "Unknown action"}}
