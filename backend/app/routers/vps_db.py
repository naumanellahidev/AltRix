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
    options: Optional[Dict[str, Any]] = None

class RpcPayload(BaseModel):
    fn: str
    params: Optional[Dict[str, Any]] = None

def is_valid_identifier(name: str) -> bool:
    return name.isidentifier()

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

from datetime import date, datetime, time
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
                # If it's a raw time (e.g. "09:00:00"), combine with today's date
                try:
                    clean_time = val.split('+')[0].split('-')[0].strip()
                    parsed_time = time.fromisoformat(clean_time)
                    return datetime.combine(date.today(), parsed_time)
                except ValueError:
                    pass
        return val
        
    # 4. Cast Time (time of day)
    elif "time" in data_type_lower and "timestamp" not in data_type_lower:
        if isinstance(val, str):
            try:
                clean_time = val.split('+')[0].split('-')[0].strip()
                return time.fromisoformat(clean_time)
            except ValueError:
                pass
        return val
        
    # 5. Cast Integer
    elif data_type_lower in ("integer", "bigint", "smallint"):
        if isinstance(val, str):
            try:
                return int(val)
            except ValueError:
                pass
        return val
        
    # 6. Cast Boolean
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
        
    try:
        await db.execute(text("SELECT set_config('request.jwt.claim.sub', :user_id, true)"), {"user_id": current_user.id})
        await db.execute(text("SELECT set_config('request.jwt.claim.role', :role, true)"), {"role": "authenticated"})
    except Exception as setting_err:
        logger.warning(f"Failed to set database proxy JWT claim parameters: {setting_err}")
        
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

def parse_or_conditions(or_str: str) -> List[Any]:
    conditions = []
    current = []
    paren_depth = 0
    in_quotes = False
    
    for char in or_str:
        if char == '"' or char == "'":
            in_quotes = not in_quotes
            current.append(char)
        elif char == '(' and not in_quotes:
            paren_depth += 1
            current.append(char)
        elif char == ')' and not in_quotes:
            paren_depth -= 1
            current.append(char)
        elif char == ',' and paren_depth == 0 and not in_quotes:
            conditions.append("".join(current).strip())
            current = []
        else:
            current.append(char)
            
    if current:
        conditions.append("".join(current).strip())
        
    parsed = []
    for cond in conditions:
        parts = cond.split('.', 2)
        if len(parts) >= 2:
            col = parts[0]
            op = parts[1]
            val = parts[2] if len(parts) > 2 else None
            
            if val and val.startswith('(') and val.endswith(')'):
                val = val[1:-1]
                
            parsed.append((col, op, val))
            
    return parsed

@router.post("/query")
async def execute_query(query: QueryPayload, current_user: CurrentUser, db: DbSession):
    if not is_valid_identifier(query.table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    try:
        await db.execute(text("SELECT set_config('request.jwt.claim.sub', :user_id, true)"), {"user_id": current_user.id})
        await db.execute(text("SELECT set_config('request.jwt.claim.role', :role, true)"), {"role": "authenticated"})
    except Exception as setting_err:
        logger.warning(f"Failed to set database proxy JWT claim parameters: {setting_err}")

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
            if query.action in ("insert", "update", "delete", "upsert"):
                logger.warning(f"Tenant {current_user.school_id} modifying global table {query.table}")

    action = query.action or "select"
    params: Dict[str, Any] = {}
    where_clauses = []
    
    async def resolve_school_id_val(val: Any) -> Optional[uuid.UUID]:
        if val is None:
            return None
        if isinstance(val, uuid.UUID):
            return val
        val_str = str(val).strip()
        if not val_str:
            return None
        try:
            return uuid.UUID(val_str)
        except ValueError:
            try:
                s_res = await db.execute(
                    text("SELECT id FROM public.schools WHERE slug = :s OR id::text = :s LIMIT 1"),
                    {"s": val_str}
                )
                s_row = s_res.fetchone()
                if s_row:
                    return s_row[0]
            except Exception:
                pass
        return None

    if has_school_id and not current_user.is_super_admin:
        resolved_tenant_id = await resolve_school_id_val(current_user.school_id) or current_user.school_id
        where_clauses.append("school_id = :__tenant_id")
        params["__tenant_id"] = cast_value(resolved_tenant_id, columns_types["school_id"])

    order_by_clauses = []
    limit_clause = ""
    filters_to_process = []
    
    # Pre-process order, limit, and range filters
    for f in query.filters:
        if f.method == "order":
            if f.args:
                col = f.args[0]
                if is_valid_identifier(col) and col in valid_columns:
                    opts = f.args[1] if len(f.args) > 1 else {}
                    asc = opts.get("ascending", True) if isinstance(opts, dict) else True
                    dir_sql = "ASC" if asc else "DESC"
                    nulls = opts.get("nullsFirst", False) if isinstance(opts, dict) else False
                    nulls_sql = " NULLS FIRST" if nulls else " NULLS LAST"
                    order_by_clauses.append(f'"{col}" {dir_sql}{nulls_sql}')
        elif f.method == "limit":
            if f.args:
                try:
                    limit_val = int(f.args[0])
                    limit_clause = f" LIMIT {limit_val}"
                except (ValueError, TypeError):
                    pass
        elif f.method == "range":
            if len(f.args) >= 2:
                try:
                    offset_val = int(f.args[0])
                    limit_val = int(f.args[1]) - offset_val + 1
                    limit_clause = f" LIMIT {limit_val} OFFSET {offset_val}"
                except (ValueError, TypeError):
                    pass
        else:
            filters_to_process.append(f)

    for i, f in enumerate(filters_to_process):
        if not f.args:
            continue
            
        if f.method == "or":
            or_clauses = []
            parsed_conds = parse_or_conditions(f.args[0])
            for j, (col, op, raw_val) in enumerate(parsed_conds):
                if not is_valid_identifier(col) or col not in valid_columns:
                    continue
                    
                param_name = f"or_{i}_{j}"
                
                if col == "school_id" and "uuid" in columns_types.get(col, "").lower():
                    if isinstance(raw_val, str) and not is_uuid(raw_val):
                        resolved = await resolve_school_id_val(raw_val)
                        if resolved:
                            raw_val = resolved

                if op == "eq":
                    or_clauses.append(f'"{col}" = :{param_name}')
                    params[param_name] = cast_value(raw_val, columns_types[col])
                elif op == "neq":
                    if raw_val is None or (isinstance(raw_val, str) and raw_val.lower() == "null"):
                        or_clauses.append(f'"{col}" IS NOT NULL')
                    else:
                        or_clauses.append(f'"{col}" != :{param_name}')
                        params[param_name] = cast_value(raw_val, columns_types[col])
                elif op == "gt":
                    or_clauses.append(f'"{col}" > :{param_name}')
                    params[param_name] = cast_value(raw_val, columns_types[col])
                elif op == "lt":
                    or_clauses.append(f'"{col}" < :{param_name}')
                    params[param_name] = cast_value(raw_val, columns_types[col])
                elif op == "gte":
                    or_clauses.append(f'"{col}" >= :{param_name}')
                    params[param_name] = cast_value(raw_val, columns_types[col])
                elif op == "lte":
                    or_clauses.append(f'"{col}" <= :{param_name}')
                    params[param_name] = cast_value(raw_val, columns_types[col])
                elif op in ("in", "in_"):
                    or_clauses.append(f'"{col}" = ANY(:{param_name})')
                    items_list = [item.strip() for item in raw_val.split(",")]
                    params[param_name] = [cast_value(item, columns_types[col]) for item in items_list]
                elif op == "is":
                    if raw_val is None or raw_val.lower() == "null":
                        or_clauses.append(f'"{col}" IS NULL')
                    else:
                        or_clauses.append(f'"{col}" = :{param_name}')
                        params[param_name] = cast_value(raw_val, columns_types[col])
                elif op in ("like", "ilike"):
                    op_sql = "ILIKE" if op == "ilike" else "LIKE"
                    or_clauses.append(f'"{col}" {op_sql} :{param_name}')
                    params[param_name] = raw_val
                    
            if or_clauses:
                where_clauses.append(f"({ ' OR '.join(or_clauses) })")
            continue

        col = f.args[0]
        if not is_valid_identifier(col) or col not in valid_columns:
            logger.debug(f"Skipping filter for column '{col}' not in table '{query.table}'")
            continue
            
        param_name = f"p_{i}"
        raw_val = f.args[1] if len(f.args) > 1 else None

        if col == "school_id" and "uuid" in columns_types.get(col, "").lower():
            if isinstance(raw_val, str) and not is_uuid(raw_val):
                resolved = await resolve_school_id_val(raw_val)
                if resolved:
                    raw_val = resolved
        
        if f.method == "eq":
            where_clauses.append(f'"{col}" = :{param_name}')
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "neq":
            if raw_val is None or (isinstance(raw_val, str) and raw_val.lower() == "null"):
                where_clauses.append(f'"{col}" IS NOT NULL')
            else:
                where_clauses.append(f'"{col}" != :{param_name}')
                params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "gt":
            where_clauses.append(f'"{col}" > :{param_name}')
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "lt":
            where_clauses.append(f'"{col}" < :{param_name}')
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "gte":
            where_clauses.append(f'"{col}" >= :{param_name}')
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "lte":
            where_clauses.append(f'"{col}" <= :{param_name}')
            params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method in ("in", "in_"):
            where_clauses.append(f'"{col}" = ANY(:{param_name})')
            if isinstance(raw_val, list):
                params[param_name] = [cast_value(item, columns_types[col]) for item in raw_val]
            else:
                params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method == "is":
            if raw_val is None:
                where_clauses.append(f'"{col}" IS NULL')
            else:
                where_clauses.append(f'"{col}" = :{param_name}')
                params[param_name] = cast_value(raw_val, columns_types[col])
        elif f.method in ("like", "ilike"):
            op = "ILIKE" if f.method == "ilike" else "LIKE"
            where_clauses.append(f'"{col}" {op} :{param_name}')
            params[param_name] = raw_val
        elif f.method == "not":
            op_filter = f.args[1] if len(f.args) > 1 else "eq"
            val_filter = f.args[2] if len(f.args) > 2 else None
            
            if op_filter == "is":
                if val_filter is None or (isinstance(val_filter, str) and val_filter.lower() == "null"):
                    where_clauses.append(f'"{col}" IS NOT NULL')
                else:
                    where_clauses.append(f'"{col}" != :{param_name}')
                    params[param_name] = cast_value(val_filter, columns_types[col])
            elif op_filter == "eq":
                if val_filter is None or (isinstance(val_filter, str) and val_filter.lower() == "null"):
                    where_clauses.append(f'"{col}" IS NOT NULL')
                else:
                    where_clauses.append(f'"{col}" != :{param_name}')
                    params[param_name] = cast_value(val_filter, columns_types[col])
            elif op_filter in ("in", "in_"):
                if isinstance(val_filter, list):
                    where_clauses.append(f'NOT ("{col}" = ANY(:{param_name}))')
                    params[param_name] = [cast_value(item, columns_types[col]) for item in val_filter]
                elif isinstance(val_filter, str):
                    where_clauses.append(f'NOT ("{col}" = ANY(:{param_name}))')
                    clean_val = val_filter
                    if clean_val.startswith('(') and clean_val.endswith(')'):
                        clean_val = clean_val[1:-1]
                    items_list = [item.strip() for item in clean_val.split(",")]
                    params[param_name] = [cast_value(item, columns_types[col]) for item in items_list]
                else:
                    where_clauses.append(f'"{col}" != :{param_name}')
                    params[param_name] = cast_value(val_filter, columns_types[col])
            else:
                where_clauses.append(f'"{col}" != :{param_name}')
                params[param_name] = cast_value(val_filter, columns_types[col])

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    if action == "select":
        select_clause = query.select if query.select and query.select != "" else "*"
        if "(" in select_clause: 
            select_clause = "*"
        elif select_clause != "*":
            parsed_cols = []
            for col_item in select_clause.split(","):
                col_item = col_item.strip()
                if not col_item:
                    continue
                if ":" in col_item:
                    parts = col_item.split(":", 1)
                    alias, actual_col = parts[0].strip(), parts[1].strip()
                    if is_valid_identifier(actual_col) and actual_col in valid_columns:
                        parsed_cols.append(f'"{actual_col}" AS "{alias}"')
                    elif is_valid_identifier(alias) and alias in valid_columns:
                        parsed_cols.append(f'"{alias}" AS "{actual_col}"')
                elif is_valid_identifier(col_item) and col_item in valid_columns:
                    parsed_cols.append(f'"{col_item}"')
            if parsed_cols:
                select_clause = ", ".join(parsed_cols)
            else:
                select_clause = "*"
            
        order_sql = (" ORDER BY " + ", ".join(order_by_clauses)) if order_by_clauses else ""
        sql = f'SELECT {select_clause} FROM "{query.table}"{where_sql}{order_sql}{limit_clause}'
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
                row = res.fetchone()
                if row:
                    inserted_rows.append(dict(row._mapping))
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

    elif action == "upsert":
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
                    
        # Resolve conflict target
        on_conflict = query.options.get("onConflict") if query.options else None
        if not on_conflict:
            # Default to "id" if present in table columns
            on_conflict = "id" if "id" in valid_columns else None
            
        if on_conflict:
            conflict_cols = ", ".join(f'"{c.strip()}"' for c in on_conflict.split(",") if is_valid_identifier(c.strip()))
            conflict_set = {c.strip() for c in on_conflict.split(",")}
            
            update_clauses = []
            for k in keys:
                if k not in conflict_set and k != "created_at":
                    update_clauses.append(f'"{k}" = EXCLUDED."{k}"')
                    
            if update_clauses:
                conflict_sql = f'ON CONFLICT ({conflict_cols}) DO UPDATE SET {", ".join(update_clauses)}'
            else:
                conflict_sql = f'ON CONFLICT ({conflict_cols}) DO NOTHING'
        else:
            conflict_sql = ''
            
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
            sql = f'INSERT INTO "{query.table}" ({cols}) VALUES ({vals}) {conflict_sql} RETURNING *'
            
            try:
                res = await db.execute(text(sql), casted_item)
                row = res.fetchone()
                if row:
                    inserted_rows.append(dict(row._mapping))
            except Exception as e:
                logger.error(f"DB Proxy Upsert Error: {e}")
                return {"data": None, "error": {"message": str(e)}}
                
        await db.flush()
        await broadcast_mutation(query.table, "upsert", current_user.school_id, inserted_rows)
        return {"data": inserted_rows, "error": None}

    return {"data": None, "error": {"message": "Unknown action"}}
