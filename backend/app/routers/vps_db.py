import logging
import json
import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from app.dependencies import CurrentUser, DbSession
from app.exceptions import ForbiddenError
from app.cache import get_redis
from app.utils.db_proxy_policy import authorize_proxy_request
from app.utils.permissions import expand_roles
from app.utils import family_scope
from app.utils import proxy_embeds
from app.utils.security import get_allowed_student_ids

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

#: Largest number of rows an unbounded read may return.
#: A caller that wants more must page explicitly with .range().
DEFAULT_ROW_LIMIT = 1000

#: Hard ceiling, even for an explicit .limit(). Without it a client could ask
#: for a million rows and the cap above would be decorative.
MAX_ROW_LIMIT = 5000


def _bounded_limit(requested: int) -> int:
    """Clamp a caller-supplied limit into something the server can serve."""
    if requested <= 0:
        return DEFAULT_ROW_LIMIT
    return min(requested, MAX_ROW_LIMIT)


#: Readable tables without a school_id, and how each belongs to a school:
#: (the column pointing at the parent row, the parent table). "schools" and
#: "profiles" are special-cased: the schools the caller belongs to, and the
#: people who share the caller's school.
CROSS_TENANT_SCOPES = {
    "schools": ("id", "schools"),
    "profiles": ("id", "profiles"),
    "report_card_subject_entries": ("report_card_id", "report_cards"),
    "co_curricular_grades": ("report_card_id", "report_cards"),
    "exam_seat_assignments": ("seating_plan_id", "exam_seating_plans"),
    "exam_invigilators": ("seating_plan_id", "exam_seating_plans"),
    "admin_message_recipients": ("message_id", "admin_messages"),
    "bus_stops": ("route_id", "bus_routes"),
}

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

#: Database functions the frontend is allowed to invoke through the proxy.
#: Anything not listed here is rejected — without an allowlist this endpoint
#: can call any function in the database.
ALLOWED_RPC_FUNCTIONS = {
    "can_edit_attendance", "can_manage_finance", "can_manage_staff",
    "can_manage_students", "can_work_crm", "check_exam_subject_conflicts",
    "convert_admission_to_student", "create_public_lead", "directory_search",
    "ensure_default_crm_pipeline", "find_parent_user_by_email",
    "generate_fee_voucher", "generate_invoice_for_student",
    "get_at_risk_students", "get_child_teachers_detailed",
    "get_school_public_by_slug", "get_school_staff_directory",
    "get_school_user_directory", "has_role", "list_school_user_profiles",
    "my_children_detailed", "my_student_id", "notify_exam_datesheet_ready",
    "notify_exam_result_publish", "owner_campuses", "owner_schools_strict",
    "search_messages", "verify_exam_hall_ticket", "verify_fee_payment_proof",
}

#: Functions that operate across tenants or expose schema/billing internals.
SUPER_ADMIN_RPC_FUNCTIONS = {
    "admin_create_campus", "cron_generate_platform_invoices",
    "export_table_schema", "list_existing_school_owners",
}

#: Parameter names that carry the tenant id; always overwritten with the
#: caller's own school so a tenant cannot aim a function at another school.
_TENANT_PARAM_NAMES = ("_school_id", "school_id", "p_school_id", "in_school_id")


def _family_guard_values(rule, item: dict) -> None:
    for col in rule.protected_cols:
        if col in item:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Marks and feedback are given by the teacher.")
    if rule.allowed_status is not None and "status" in item and item["status"] not in rule.allowed_status:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"You cannot set the status to '{item['status']}'.")


async def _family_check_rows(db, rule, items, valid_columns, current_user, kids: set, params: dict) -> None:
    """A family's insert: owner columns are the caller; a student is their own
    child; and the table's own condition holds (e.g. the message replied to
    is one they can see)."""
    me = str(current_user.id)
    for item in items:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid payload format")
        for col in rule.owner_cols:
            if col in valid_columns:
                item[col] = me
        _family_guard_values(rule, item)
        if (rule.child and "student_id" in valid_columns and item.get("student_id") is not None
                and str(item["student_id"]) not in kids):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="You can only record this for your own child.")
        if rule.insert_check:
            bound = {k: v for k, v in params.items() if k.startswith("__") and not k.startswith("__v_")}
            for col, val in item.items():
                if is_valid_identifier(col):
                    bound[f"__v_{col}"] = None if val is None else str(val)
            for needed in re.findall(r":(__v_\w+)", rule.insert_check):
                bound.setdefault(needed, None)
            ok = (await db.execute(text(f"SELECT {rule.insert_check}"), bound)).scalar()
            if not ok:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="That is not a conversation you are part of.")


@router.post("/rpc")
async def execute_rpc(payload: RpcPayload, current_user: CurrentUser, db: DbSession):
    fn = payload.fn
    if not is_valid_identifier(fn):
        raise HTTPException(status_code=400, detail="Invalid function name")

    if fn in SUPER_ADMIN_RPC_FUNCTIONS:
        if not current_user.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Function '{fn}' requires platform administrator access.",
            )
    elif fn not in ALLOWED_RPC_FUNCTIONS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Function '{fn}' is not callable through the data proxy.",
        )

    # A parent or student calls only what concerns them (family_scope.py).
    if family_scope.is_family_caller(current_user):
        fn = family_scope.FAMILY_RPC_SUBSTITUTE.get(fn, fn)
        if fn not in family_scope.FAMILY_RPC:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Function '{fn}' is not available to parent or student accounts.",
            )

    # The request identity is published on the connection by get_db(); it used
    # to be set here with is_local=true, which any mid-request COMMIT discarded.
        
    params = payload.params or {}
    
    # Enforce tenant isolation for school-scoped functions: whichever spelling
    # the function uses, the tenant id always comes from the verified session
    # rather than from the request body.
    if not current_user.is_super_admin:
        for _tenant_param in _TENANT_PARAM_NAMES:
            if _tenant_param in params:
                if not current_user.school_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="No school context. Send the X-School-Id header.",
                    )
                params[_tenant_param] = str(current_user.school_id)


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

def build_conflict_where(predicate: Optional[str], valid_columns) -> str:
    """The WHERE of an ON CONFLICT target, for a partial unique index.

    Postgres will not use a partial unique index to arbitrate a conflict
    unless the statement repeats the index's predicate, so an upsert against
    one needs a way to say it.

    This is not a hole for free SQL. A partial unique index's predicate, in
    this schema, is always "<column> IS NULL" or "<column> IS NOT NULL", and
    that is the only thing accepted: the column must be a real column of the
    table being written, and anything else raises rather than being passed
    through to the database.
    """
    if not predicate:
        return ""
    parsed = re.fullmatch(
        r"\s*([A-Za-z_][A-Za-z0-9_]*)\s+IS\s+(NOT\s+)?NULL\s*",
        str(predicate),
        re.IGNORECASE,
    )
    if not parsed:
        raise ValueError(f"Unsupported onConflictWhere: {predicate}")
    # Resolved against the table's real columns, case-insensitively, and the
    # *resolved* name is what gets quoted into the statement. Emitting the
    # caller's spelling would quote "EXAM_ID", which Postgres treats as a
    # different identifier from exam_id and would not match the index.
    wanted = parsed.group(1).lower()
    column = next((c for c in valid_columns if c.lower() == wanted), None)
    if column is None:
        raise ValueError(f"Unsupported onConflictWhere: {predicate}")
    negated = "NOT " if parsed.group(2) else ""
    return f' WHERE "{column}" IS {negated}NULL'


def build_select_clause(requested: Optional[str], valid_columns: set) -> str:
    """
    Turn a Supabase-style select string into a SQL column list.

    Everything returned here is interpolated straight into the statement, so the
    only strings that may escape this function are ones that passed
    ``is_valid_identifier`` AND name a real column of the target table. An alias
    used to be emitted unchecked, which allowed
    ``select='x", (SELECT ...) AS "y:id'`` to smuggle a subquery into the SQL.

    Anything unrecognised is dropped rather than passed through; if nothing
    survives, fall back to "*" so the caller still gets the row.
    """
    select_clause = requested if requested else "*"
    if "(" in select_clause:
        # Embedded relation syntax (Supabase joins) is not supported here.
        return "*"
    if select_clause == "*":
        return "*"

    parsed_cols = []
    for col_item in select_clause.split(","):
        col_item = col_item.strip()
        if not col_item:
            continue
        if ":" in col_item:
            alias, _, actual_col = col_item.partition(":")
            alias, actual_col = alias.strip(), actual_col.strip()
            if not (is_valid_identifier(alias) and is_valid_identifier(actual_col)):
                continue
            if actual_col in valid_columns:
                parsed_cols.append(f'"{actual_col}" AS "{alias}"')
            elif alias in valid_columns:
                parsed_cols.append(f'"{alias}" AS "{actual_col}"')
        elif is_valid_identifier(col_item) and col_item in valid_columns:
            parsed_cols.append(f'"{col_item}"')

    return ", ".join(parsed_cols) if parsed_cols else "*"


_RELATION_OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
                 "like": "LIKE", "ilike": "ILIKE", "in": "IN", "is": "IS"}


def _pg_type_of(column: str) -> str:
    """Comparison type for a range filter on a relation's column, by name."""
    if column.endswith(("_date", "_on")) or column in ("date", "session_date", "due_date"):
        return "date"
    if column.endswith(("_at", "_time")):
        return "timestamptz"
    return "numeric"


@router.post("/query")
async def execute_query(query: QueryPayload, current_user: CurrentUser, db: DbSession):
    if not is_valid_identifier(query.table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    # The request identity is published on the connection by get_db(); it used
    # to be set here with is_local=true, which any mid-request COMMIT discarded.

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
    action = query.action or "select"

    # ── Authorization ────────────────────────────────────────────────────────
    # A caller-supplied filter is anything other than the presentation-only
    # methods; an update/delete with none of those would cover the whole table.
    _presentation_methods = {"order", "limit", "range", "single", "maybeSingle"}
    has_user_filter = any(
        f.method not in _presentation_methods for f in query.filters
    )

    # Role values the caller is attempting to write, for role-management tables.
    payload_roles: set[str] = set()
    if isinstance(query.payload, dict):
        if query.payload.get("role"):
            payload_roles.add(str(query.payload["role"]).strip().lower())
    elif isinstance(query.payload, list):
        for _item in query.payload:
            if isinstance(_item, dict) and _item.get("role"):
                payload_roles.add(str(_item["role"]).strip().lower())

    authorize_proxy_request(
        table=query.table,
        action=action,
        roles=expand_roles(current_user.roles or []),
        is_super_admin=current_user.is_super_admin,
        has_school_id=has_school_id,
        has_user_filter=has_user_filter,
        payload_roles=payload_roles,
    )

    # A tenant user must have a resolved school before touching tenant data,
    # otherwise the tenant filter below would be built from an empty value.
    if not current_user.is_super_admin and has_school_id and not current_user.school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No school context. Send the X-School-Id header.",
        )

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
            s_res = await db.execute(
                text("SELECT id FROM public.schools WHERE slug = :s OR id::text = :s LIMIT 1"),
                {"s": val_str}
            )
            s_row = s_res.fetchone()
            if s_row:
                return s_row[0]
        return None

    if has_school_id and not current_user.is_super_admin:
        resolved_tenant_id = await resolve_school_id_val(current_user.school_id) or current_user.school_id
        where_clauses.append("school_id = :__tenant_id")
        params["__tenant_id"] = cast_value(resolved_tenant_id, columns_types["school_id"])

    # Readable tables without a school_id used to be served whole: any signed-in
    # user of any school could read every school's report-card marks, exam
    # seating, message recipients and bus stops, every user's profile (name,
    # phone, email) and every school's record. Each is now confined to the
    # caller's school, through the row it belongs to.
    table_key = query.table.lower()
    if not has_school_id and not current_user.is_super_admin and table_key in CROSS_TENANT_SCOPES:
        scope_school = await resolve_school_id_val(current_user.school_id)
        me = uuid.UUID(str(current_user.id))
        if table_key == "schools":
            where_clauses.append(
                "(id = :__scope_school"
                " OR id IN (SELECT ur.school_id FROM public.user_roles ur WHERE ur.user_id = :__me)"
                " OR id IN (SELECT oa.school_id FROM public.school_owner_assignments oa WHERE oa.owner_user_id = :__me))"
            )
        elif table_key == "profiles":
            where_clauses.append(
                "(id = :__me OR ("
                "id IN (SELECT ur.user_id FROM public.user_roles ur WHERE ur.school_id = :__scope_school"
                " UNION SELECT sm.user_id FROM public.school_memberships sm WHERE sm.school_id = :__scope_school)"
                " AND NOT EXISTS (SELECT 1 FROM public.platform_super_admins psa WHERE psa.user_id = profiles.id)))"
            )
        else:
            if scope_school is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No school context. Send the X-School-Id header.",
                )
            fk, parent = CROSS_TENANT_SCOPES[table_key]
            where_clauses.append(f"{fk} IN (SELECT p.id FROM public.{parent} p WHERE p.school_id = :__scope_school)")
        params["__scope_school"] = scope_school
        params["__me"] = me

    # Parents and students: their own children's rows, their own messages and
    # settings, and the school's public structure. Everything else in the
    # school was readable by them, and most of it writable (family_scope.py).
    family_write = None
    family_kids: set = set()
    if family_scope.is_family_caller(current_user):
        if action == "select":
            family_filter = family_scope.read_rule(table_key, valid_columns)
            if family_filter is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"'{query.table}' is not available to parent or student accounts.",
                )
        else:
            family_write = family_scope.WRITE_RULES.get(table_key)
            if family_write is None or action not in family_write.actions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Parent and student accounts cannot {action} '{query.table}'.",
                )
            family_filter = family_write.scope if action in ("update", "delete") else ""
        family_kids = {str(k) for k in (await get_allowed_student_ids(current_user, db) or [])}
        params["__kids"] = [uuid.UUID(k) for k in sorted(family_kids)]
        params["__me"] = uuid.UUID(str(current_user.id))
        params["__fam_school"] = await resolve_school_id_val(current_user.school_id)
        params["__aud"] = family_scope.notice_audiences(current_user)
        if family_filter:
            where_clauses.append(f"({family_filter})")

    # Relations in the select (``students(first_name)``) and filters on a
    # relation's column (``admin_messages.school_id``): see proxy_embeds.py.
    _column_cache: Dict[str, set] = {query.table: set(valid_columns)}

    async def _columns_of(tbl: str) -> set:
        if tbl not in _column_cache:
            if not is_valid_identifier(tbl):
                return set()
            res_cols = await db.execute(
                text("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :t"),
                {"t": tbl},
            )
            _column_cache[tbl] = {r[0] for r in res_cols.fetchall()}
        return _column_cache[tbl]

    _is_family = family_scope.is_family_caller(current_user)

    async def _scope_for(tbl: str, cols: set, alias: str) -> str:
        # A relation is a read of its table: the same policy, school and family rules.
        authorize_proxy_request(
            table=tbl, action="select", roles=expand_roles(current_user.roles or []),
            is_super_admin=current_user.is_super_admin, has_school_id="school_id" in cols,
            has_user_filter=True,
        )
        parts = []
        if "school_id" in cols and not current_user.is_super_admin:
            params["__embed_school"] = await resolve_school_id_val(current_user.school_id)
            parts.append(f'{alias}."school_id" = :__embed_school')
        if _is_family:
            rule = family_scope.read_rule(tbl, cols)
            if rule is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"'{tbl}' is not available to parent or student accounts.",
                )
            if rule:
                # Rules name their table ("student_marks.assessment_id");
                # inside a relation it goes by its alias.
                parts.append(re.sub(rf'(?<![\w."]){re.escape(tbl)}\.', f"{alias}.", rule))
        return " AND ".join(parts)

    embeds = proxy_embeds.EmbedBuilder(db, _columns_of, _scope_for)

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
                    limit_val = _bounded_limit(int(f.args[0]))
                    limit_clause = f" LIMIT {limit_val}"
                except (ValueError, TypeError):
                    pass
        elif f.method == "range":
            if len(f.args) >= 2:
                try:
                    offset_val = max(0, int(f.args[0]))
                    limit_val = _bounded_limit(int(f.args[1]) - offset_val + 1)
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
        if isinstance(col, str) and "." in col and f.method in _RELATION_OPS:
            rel_param = f"rel_{i}"
            rel_val = f.args[1] if len(f.args) > 1 else None

            def _cond(ref, rcol, rcols, method=f.method, val=rel_val, pname=rel_param):
                if method == "is" or val is None or (isinstance(val, str) and val.lower() == "null" and method in ("eq", "is")):
                    if val is None or str(val).lower() == "null":
                        return f'{ref}."{rcol}" IS NULL'
                    params[pname] = str(val).lower() == "true"
                    return f'{ref}."{rcol}" IS {"TRUE" if params[pname] else "FALSE"}'
                if method == "in":
                    items = val if isinstance(val, list) else [x.strip() for x in str(val).strip("()").split(",")]
                    params[pname] = [str(x) for x in items]
                    return f'{ref}."{rcol}"::text = ANY(:{pname})'
                params[pname] = str(val)
                op = _RELATION_OPS[method]
                return f'{ref}."{rcol}"::text {op} :{pname}' if method in ("eq", "neq", "like", "ilike") \
                    else f'{ref}."{rcol}" {op} CAST(CAST(:{pname} AS text) AS {_pg_type_of(rcol)})'

            where_clauses.append(await embeds.filter_condition(
                query.table, f'"{query.table}"', query.select, col, _cond))
            continue
        if not is_valid_identifier(col) or col not in valid_columns:
            # Dropping a filter widens the result: a screen asking for one
            # sender's messages got the whole school's. Refuse instead.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot filter '{query.table}' on '{col}': no such column.",
            )
            
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

    embed_select_sql = None
    if action == "select" and proxy_embeds.has_embeds(query.select):
        embed_select_sql, inner_relations = await embeds.columns_sql(query.table, f'"{query.table}"', query.select)
        for _rel, cond in inner_relations:
            where_clauses.append(cond)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    if action == "select":
        # Supabase-style `select(cols, { count: "exact", head: true })`.
        #
        # These options were being sent by the frontend and silently dropped, so
        # `count` came back as "however many rows we happened to return" — wrong
        # for any table past the row cap — and `head: true` still transferred
        # every row just to count them. Both are now answered with a real
        # COUNT(*).
        opts = query.options or {}
        wants_count = str(opts.get("count") or "").lower() in ("exact", "planned", "estimated")
        head_only = bool(opts.get("head"))

        exact_count = None
        if wants_count:
            count_sql = f'SELECT count(*) FROM "{query.table}"{where_sql}'
            try:
                exact_count = (await db.execute(text(count_sql), params)).scalar()
            except Exception as e:
                logger.error(f"DB Proxy Count Error: {e}")
                return {"data": None, "error": {"message": str(e)}}

            if head_only:
                # The caller only wanted the number.
                return {"data": [], "count": exact_count, "error": None}

        select_clause = embed_select_sql or build_select_clause(query.select, valid_columns)

        order_sql = (" ORDER BY " + ", ".join(order_by_clauses)) if order_by_clauses else ""

        # Cap every read. Only 145 of the frontend's several hundred queries set
        # a limit of their own, so the rest asked for whole tables: a school with
        # 50,000 attendance rows would serialise all of them into one response,
        # on every page load. The cap is high enough not to truncate real screens
        # and low enough that a runaway query cannot take the process down.
        capped = not limit_clause
        if capped:
            limit_clause = f" LIMIT {DEFAULT_ROW_LIMIT + 1}"

        sql = f'SELECT {select_clause} FROM "{query.table}"{where_sql}{order_sql}{limit_clause}'
        try:
            res = await db.execute(text(sql), params)
            rows = [dict(r._mapping) for r in res.fetchall()]

            truncated = False
            if capped and len(rows) > DEFAULT_ROW_LIMIT:
                # One extra row was fetched purely to detect this.
                rows = rows[:DEFAULT_ROW_LIMIT]
                truncated = True
                logger.warning(
                    f"Unbounded read of '{query.table}' hit the {DEFAULT_ROW_LIMIT}-row "
                    "cap; the caller should paginate."
                )

            if _is_family:
                family_scope.redact_rows(rows)
            return {
                "data": rows,
                "count": exact_count if exact_count is not None else len(rows),
                "error": None,
                "truncated": truncated,
            }
        except Exception as e:
            logger.error(f"DB Proxy Select Error: {e}")
            return {"data": None, "error": {"message": str(e)}}

    elif action == "insert":
        if not isinstance(query.payload, (dict, list)):
            return {"data": None, "error": {"message": "Invalid payload format"}}
            
        items = query.payload if isinstance(query.payload, list) else [query.payload]
        if not items:
            return {"data": [], "error": None}

        if family_write is not None:
            await _family_check_rows(db, family_write, items, valid_columns, current_user, family_kids, params)

        keys = list(items[0].keys())
        for k in keys:
            if not is_valid_identifier(k) or k not in valid_columns:
                return {"data": None, "error": {"message": f"Invalid column {k}"}}
                
        if has_school_id and not current_user.is_super_admin:
            for item in items:
                item["school_id"] = str(current_user.school_id)
                if "school_id" not in keys:
                    keys.append("school_id")
                    
        # One statement for the whole batch rather than one per row.
        #
        # Every write in the product goes through this endpoint, so marking a
        # class of 40 present used to be 40 round trips, and a bulk student
        # import of 500 rows was 500 — each with its own network latency, and
        # each able to fail halfway leaving a partial import behind.
        casted_items = []
        for item in items:
            casted = {}
            for k in keys:
                if k in item:
                    casted[k] = cast_value(item[k], columns_types[k])
                elif k == "school_id" and has_school_id:
                    casted["school_id"] = cast_value(current_user.school_id, columns_types["school_id"])
                else:
                    casted[k] = None
            casted_items.append(casted)

        cols = ", ".join(f'"{k}"' for k in keys)
        value_groups = []
        params_multi: Dict[str, Any] = {}
        for idx, casted in enumerate(casted_items):
            placeholders = []
            for k in keys:
                name = f"{k}_{idx}"
                placeholders.append(f":{name}")
                params_multi[name] = casted.get(k)
            value_groups.append("(" + ", ".join(placeholders) + ")")

        sql = (
            f'INSERT INTO "{query.table}" ({cols}) '
            f'VALUES {", ".join(value_groups)} RETURNING *'
        )
        try:
            res = await db.execute(text(sql), params_multi)
            inserted_rows = [dict(r._mapping) for r in res.fetchall()]
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
            if family_write is not None:
                if k in family_write.owner_cols:
                    continue
                _family_guard_values(family_write, {k: v})
                if k == "student_id" and v is not None and str(v) not in family_kids:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                        detail="You can only record this for your own child.")
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

        if family_write is not None:
            await _family_check_rows(db, family_write, items, valid_columns, current_user, family_kids, params)

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
            
        # A partial unique index can only arbitrate a conflict when the
        # statement repeats its predicate. report_cards has exactly that: a
        # UNIQUE (school_id, student_id, period_type, period_label) WHERE
        # exam_id IS NULL, so without this every monthly, termly and annual
        # card failed to save with "no unique or exclusion constraint
        # matching the ON CONFLICT specification".
        conflict_where = query.options.get("onConflictWhere") if query.options else None
        try:
            conflict_where_sql = build_conflict_where(conflict_where, valid_columns)
        except ValueError as exc:
            return {"data": None, "error": {"message": str(exc)}}

        if on_conflict:
            conflict_cols = ", ".join(f'"{c.strip()}"' for c in on_conflict.split(",") if is_valid_identifier(c.strip()))
            conflict_set = {c.strip() for c in on_conflict.split(",")}
            
            update_clauses = []
            for k in keys:
                if k not in conflict_set and k != "created_at":
                    update_clauses.append(f'"{k}" = EXCLUDED."{k}"')
                    
            if update_clauses:
                conflict_sql = f'ON CONFLICT ({conflict_cols}){conflict_where_sql} DO UPDATE SET {", ".join(update_clauses)}'
            else:
                conflict_sql = f'ON CONFLICT ({conflict_cols}){conflict_where_sql} DO NOTHING'
        else:
            conflict_sql = ''
            
        # Batched for the same reason as insert: one statement, not one per row.
        casted_items = []
        for item in items:
            casted = {}
            for k in keys:
                if k in item:
                    casted[k] = cast_value(item[k], columns_types[k])
                elif k == "school_id" and has_school_id:
                    casted["school_id"] = cast_value(current_user.school_id, columns_types["school_id"])
                else:
                    casted[k] = None
            casted_items.append(casted)

        cols = ", ".join(f'"{k}"' for k in keys)
        value_groups = []
        params_multi: Dict[str, Any] = {}
        for idx, casted in enumerate(casted_items):
            placeholders = []
            for k in keys:
                name = f"{k}_{idx}"
                placeholders.append(f":{name}")
                params_multi[name] = casted.get(k)
            value_groups.append("(" + ", ".join(placeholders) + ")")

        sql = (
            f'INSERT INTO "{query.table}" ({cols}) '
            f'VALUES {", ".join(value_groups)} {conflict_sql} RETURNING *'
        )
        try:
            res = await db.execute(text(sql), params_multi)
            inserted_rows = [dict(r._mapping) for r in res.fetchall()]
        except Exception as e:
            logger.error(f"DB Proxy Upsert Error: {e}")
            return {"data": None, "error": {"message": str(e)}}

        await db.flush()
        await broadcast_mutation(query.table, "upsert", current_user.school_id, inserted_rows)
        return {"data": inserted_rows, "error": None}

    return {"data": None, "error": {"message": "Unknown action"}}
