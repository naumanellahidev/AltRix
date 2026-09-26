"""
Embedded relations in data-proxy selects: ``students(first_name, last_name)``.

The frontend was written against Supabase, where a select can pull a related
row (or rows) alongside each result: ``academic_classes(name)``,
``students!inner(first_name)``, ``students:student_id(first_name)``,
``session_id!inner(class_section_id)``, nested as deep as needed. The proxy
answered every such select with the bare row and none of the relation, so
43 screens showed no class names, no student names, no max marks, no
message bodies. Filters on a relation's column (``admin_messages.school_id``)
were dropped outright, which widened the result instead of narrowing it.

This builds each relation as a correlated JSON subquery over the database's
own foreign keys:

* many-to-one (this row points at the other): a JSON object, or null;
* one-to-many (other rows point at this one): a JSON array;
* ``!inner`` keeps only rows that have the relation.

Every relation is checked like a table read in its own right: the proxy's
policy, the caller's school, and for a parent or student the family rules.
Identifiers are only ever real table and column names from the catalogue.
"""
import re
from typing import Awaitable, Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import text

_FK_CACHE: Optional[List[Tuple[str, str, str, str]]] = None
_EMBED = re.compile(r"^(?:(\w+)\s*:\s*)?(\w+)(?:\s*!\s*(\w+))?\s*\((.*)\)$", re.S)
MAX_CHILD_ROWS = 1000
_ACCOUNT_COLUMNS = ("user_id", "profile_id", "sender_user_id", "recipient_user_id", "author_user_id",
                    "teacher_user_id", "parent_user_id", "created_by")


class EmbedError(HTTPException):
    def __init__(self, detail: str, code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=code, detail=detail)


async def foreign_keys(db) -> List[Tuple[str, str, str, str]]:
    """(table, column, referenced table, referenced column), single-column FKs in public."""
    global _FK_CACHE
    if _FK_CACHE is None:
        rows = await db.execute(text(
            """
            SELECT cl.relname, a.attname, rcl.relname, ra.attname
            FROM pg_constraint c
            JOIN pg_class cl ON cl.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
            JOIN pg_class rcl ON rcl.oid = c.confrelid
            JOIN pg_namespace rn ON rn.oid = rcl.relnamespace AND rn.nspname = 'public'
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
            WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
            """
        ))
        _FK_CACHE = [tuple(r) for r in rows.fetchall()]
    return _FK_CACHE


def split_top(select: str) -> List[str]:
    """Split on commas that are not inside parentheses."""
    parts, depth, cur = [], 0, ""
    for ch in select:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                raise EmbedError("Unbalanced parentheses in select")
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if depth:
        raise EmbedError("Unbalanced parentheses in select")
    if cur.strip():
        parts.append(cur.strip())
    return parts


def has_embeds(select: Optional[str]) -> bool:
    return bool(select) and "(" in select


class Relation:
    def __init__(self, key: str, table: str, join_sql: str, to_many: bool, inner: bool):
        self.key = key          # the name the result carries it under
        self.table = table
        self.join_sql = join_sql  # condition, with {child} and {parent} placeholders
        self.to_many = to_many
        self.inner = inner


class EmbedBuilder:
    """
    ``columns_of(table)`` returns the table's columns (empty set: no such table).
    ``scope_for(table, columns, alias)`` returns the extra WHERE for a relation
    (school, family rules) or raises; "" for none.
    """

    def __init__(self, db, columns_of: Callable[[str], Awaitable[set]],
                 scope_for: Callable[[str, set, str], Awaitable[str]]):
        self.db = db
        self.columns_of = columns_of
        self.scope_for = scope_for
        self.n = 0

    def _alias(self) -> str:
        self.n += 1
        return f"e{self.n}"

    async def relation(self, parent: str, parent_cols: set, name: str, alias: Optional[str],
                       hint: Optional[str]) -> Relation:
        fks = await foreign_keys(self.db)
        inner = hint == "inner"
        column_hint = hint if hint and hint not in ("inner", "left") else None
        key = alias or name

        # `session_id!inner(...)` / `students:student_id(...)`: named by this row's FK column.
        if name in parent_cols:
            ref = next(((rt, rc) for t, c, rt, rc in fks if t == parent and c == name), None)
            if not ref and (name in _ACCOUNT_COLUMNS or name.endswith("_user_id")):
                ref = ("profiles", "id")  # an account id: that account's profile
            if not ref:
                raise EmbedError(f"'{name}' on '{parent}' does not refer to another table")
            return Relation(key, ref[0], f'{{child}}."{ref[1]}" = {{parent}}."{name}"', False, inner)

        # Named by table: this row points at it (many-to-one) ...
        outward = [(c, rc) for t, c, rt, rc in fks if t == parent and rt == name]
        if column_hint:
            outward = [o for o in outward if o[0] == column_hint] or outward
        if outward:
            col, rcol = outward[0]
            return Relation(key, name, f'{{child}}."{rcol}" = {{parent}}."{col}"', False, inner)
        # ... or it points at this row (one-to-many).
        inward = [(c, rc) for t, c, rt, rc in fks if t == name and rt == parent]
        if column_hint:
            inward = [i for i in inward if i[0] == column_hint] or inward
        if inward:
            col, rcol = inward[0]
            return Relation(key, name, f'{{child}}."{col}" = {{parent}}."{rcol}"', True, inner)
        # Account ids (user_id, sender_user_id, ...) refer to auth.users, which
        # has no table here; the profile of that account has the same id.
        if name == "profiles":
            candidates = [column_hint] if column_hint else list(_ACCOUNT_COLUMNS)
            col = next((c for c in candidates if c in parent_cols), None)
            if col:
                return Relation(key, "profiles", f'{{child}}."id" = {{parent}}."{col}"', False, inner)
        raise EmbedError(f"No relationship between '{parent}' and '{name}'")

    async def columns_sql(self, table: str, table_ref: str, select: str) -> Tuple[str, List[Tuple[Relation, str]]]:
        """The SELECT list for `table` (referred to as `table_ref`), and its inner relations."""
        cols = await self.columns_of(table)
        out, inners = [], []
        for item in split_top(select or "*"):
            if item == "*":
                out.append(f"{table_ref}.*")
                continue
            m = _EMBED.match(item)
            if m:
                alias, name, hint, inner_select = m.groups()
                rel = await self.relation(table, cols, name, alias, hint)
                expr, cond = await self.subquery(rel, table_ref, inner_select)
                out.append(f'{expr} AS "{rel.key}"')
                if rel.inner:
                    inners.append((rel, cond))
                continue
            alias, _, col = item.partition(":") if ":" in item else ("", "", item)
            col = col.strip()
            alias = alias.strip() or col
            if not (col.isidentifier() and alias.isidentifier()) or col not in cols:
                raise EmbedError(f"Column '{col}' does not exist on '{table}'")
            out.append(f'{table_ref}."{col}" AS "{alias}"' if alias != col else f'{table_ref}."{col}"')
        return ", ".join(out) or f"{table_ref}.*", inners

    async def subquery(self, rel: Relation, parent_ref: str, inner_select: str) -> Tuple[str, str]:
        child_cols = await self.columns_of(rel.table)
        if not child_cols:
            raise EmbedError(f"Table '{rel.table}' does not exist")
        a = self._alias()
        join = rel.join_sql.format(child=a, parent=parent_ref)
        scope = await self.scope_for(rel.table, child_cols, a)
        where = join + (f" AND ({scope})" if scope else "")
        cols_sql, inners = await self.columns_sql(rel.table, a, inner_select)
        for sub_rel, cond in inners:  # nested !inner narrows this level
            where += f" AND {cond}"
        row = f"SELECT {cols_sql} FROM \"{rel.table}\" {a} WHERE {where}"
        j = self._alias()
        if rel.to_many:
            expr = (f"(SELECT COALESCE(json_agg(row_to_json({j})), '[]'::json) "
                    f"FROM ({row} LIMIT {MAX_CHILD_ROWS}) {j})")
        else:
            expr = f"(SELECT row_to_json({j}) FROM ({row} LIMIT 1) {j})"
        exists = f'EXISTS (SELECT 1 FROM "{rel.table}" {a} WHERE {where})'
        return expr, exists

    async def filter_condition(self, table: str, table_ref: str, select: Optional[str], path: str,
                               column_condition: Callable[[str, str, set], str]) -> str:
        """
        A filter on a relation's column (``rel.col``): the parent row is kept
        when a related row matches. ``column_condition(ref, col, cols)`` builds
        the comparison for the related table's column.
        """
        rel_name, _, col = path.partition(".")
        cols = await self.columns_of(table)
        # Use the same relation the select embedded under that name, if any.
        name, alias, hint = rel_name, None, None
        for item in split_top(select or ""):
            m = _EMBED.match(item)
            if m and (m.group(1) or m.group(2)) == rel_name:
                alias, name, hint = m.group(1), m.group(2), m.group(3)
                break
        rel = await self.relation(table, cols, name, alias, hint)
        child_cols = await self.columns_of(rel.table)
        if col not in child_cols:
            raise EmbedError(f"Column '{col}' does not exist on '{rel.table}'")
        a = self._alias()
        scope = await self.scope_for(rel.table, child_cols, a)
        where = rel.join_sql.format(child=a, parent=table_ref)
        if scope:
            where += f" AND ({scope})"
        where += f" AND {column_condition(a, col, child_cols)}"
        return f'EXISTS (SELECT 1 FROM "{rel.table}" {a} WHERE {where})'


def reset_cache() -> None:
    global _FK_CACHE
    _FK_CACHE = None
