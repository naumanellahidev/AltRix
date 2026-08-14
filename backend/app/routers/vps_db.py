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

class RpcPayload(BaseModel):
    fn: str
    params: Optional[Dict[str, Any]] = None

def is_valid_identifier(name: str) -> bool:
    return name.isidentifier() and not name.startswith("_")

def is_uuid(val: Any) -> bool:
    if not isinstance(val, str):
        return False
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False

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

from datetime import date, datetime
import uuid

def cast_value(val: Any, data_type: str) -> Any:
    if val is None:
        return None
        
    data_type_lower = data_type.lower()
    
    # 1. Cast UUID
    if "uuid" in data_type_lower:
        if isinstance(val, str):
            try:
                return uuid.UUID(val)
            except ValueError:
                pass
        return val
        
    # 2. Cast Date
    elif data_type_lower == "date":
        if isinstance(val, str):
            try:
                date_str = val.split('T')[0].split(' ')[0]
                return date.fromisoformat(date_str)
            except ValueError:
                pass
        return val
        
    # 3. Cast Timestamp
    elif "timestamp" in data_type_lower:
        if isinstance(val, str):
            try:
                clean_val = val.replace('Z', '+00:00')
                return datetime.fromisoformat(clean_val)
            except ValueError:
                pass
        return val
        
    # 4. Cast Integer
    elif data_type_lower in ("integer", "bigint", "smallint"):
        if isinstance(val, str):
            try:
                return int(val)
            except ValueError:
                pass
        return val
        
    # 5. Cast Boolean
    elif data_type_lower == "boolean":
        if isinstance(val, str):
            if val.lower() == "true":
                return True
            if val.lower() == "false":
                return False
        return val
        
    return val

@router.post("/rpc")
async def execute_rpc(payload: RpcPayload, current_user: CurrentUser, db: DbSession):
    fn = payload.fn
    if not is_valid_identifier(fn):
        raise HTTPException(status_code=400, detail="Invalid function name")
        
    params = payload.params or {}
    
    # Enforce tenant isolation for school-scoped functions
    if not current_user.is_super_admin:
        if "_school_id" in params:
            params["_school_id"] = str(current_user.school_id)
            
    # Build arguments list for SQL call
    arg_clauses = []
    sql_params = {}
    
    for k, v in params.items():
        if not is_valid_identifier(k):
            raise HTTPException(status_code=400, detail="Invalid parameter name")
        arg_clauses.append(f'"{k}" := :{k}')
        # Convert UUID strings to UUID objects for database compat
        if isinstance(v, str) and is_uuid(v):
            sql_params[k] = uuid.UUID(v)
        else:
            sql_params[k] = v
            
    args_str = ", ".join(arg_clauses)
    sql = f'SELECT * FROM "{fn}"({args_str})'
    
    try:
        res = await db.execute(text(sql), sql_params)
        fetchall_res = res.fetchall()
        if not fetchall_res:
            return {"data": None, "error": None}
            
        rows = [dict(r._mapping) for r in fetchall_res]
        
        # Format scalar outputs to match Supabase RPC return structure
        if len(rows) > 0 and len(rows[0]) == 1:
            key = list(rows[0].keys())[0]
            if key.lower() == fn.lower():
                if len(rows) == 1:
                    return {"data": rows[0][key], "error": None}
                return {"data": [r[key] for r in rows], "error": None}
                
        return {"data": rows, "error": None}
    except Exception as e:
        logger.error(f"DB Proxy RPC Error in {fn}: {e}")
        return {"data": None, "error": {"message": str(e)}}

@router.post("/query")
async def execute_query(query: QueryPayload, current_user: CurrentUser, db: DbSession):
    if not is_valid_identifier(query.table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    try:
        col_query = text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = :table
        """)
        res = await db.execute(col_query, {"table": query.table})
        columns_types = {row[0]: row[1] for row in res.fetchall()}
        valid_columns = set(columns_types.keys())
    except Exception as db_err:
        logger.error(f"DB Proxy Table Schema Error: {db_err}")
        return {"data": None, "error": {"message": f"Database connection error: {db_err}"}}

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
        params["__tenant_id"] = cast_value(current_user.school_id, columns_types["school_id"])

    for i, f in enumerate(query.filters):
        if not f.args:
            continue
        col = f.args[0]
        if not is_valid_identifier(col) or col not in valid_columns:
            raise HTTPException(status_code=400, detail=f"Invalid column {col}")
            
        param_name = f"p_{i}"
        raw_val = f.args[1] if len(f.args) > 1 else None
        
        if f.method == "eq":
            where_clauses.append(f"{col} = :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "neq":
            where_clauses.append(f"{col} != :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "gt":
            where_clauses.append(f"{col} > :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "lt":
            where_clauses.append(f"{col} < :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "gte":
            where_clauses.append(f"{col} >= :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "lte":
            where_clauses.append(f"{col} <= :{param_name}")
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method in ("in", "in_"):
            where_clauses.append(f"{col} = ANY(:{param_name})")
            if isinstance(raw_val, list):
                params[param_name] = [cast_value(item, columns_types[col]) for item in raw_val]
            else:
                params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "is":
            if raw_val is None:
                where_clauses.append(f"{col} IS NULL")
            else:
                where_clauses.append(f"{col} = :{param_name}")
                params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method in ("like", "ilike"):
            op = "ILIKE" if f.method == "ilike" else "LIKE"
            where_clauses.append(f"{col} {op} :{param_name}")
            params[param_name] = raw_val

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
            casted_item = {}
            for k in keys:
                if k in item:
                    casted_item[k] = cast_value(item[k], columns_types[k])
                elif k == "school_id" and has_school_id:
                    casted_item["school_id"] = cast_value(current_user.school_id, columns_types["school_id"])
                    
            cols = ", ".join(f'"{k}"' for k in keys)
            vals = ", ".join(f":{k}" for k in keys)
            sql = f'INSERT INTO "{query.table}" ({cols}) VALUES ({vals}) RETURNING *'
            try:
                res = await db.execute(text(sql), casted_item)
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
            params[f"u_{k}"] = cast_value(v, columns_types[k])
            
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
