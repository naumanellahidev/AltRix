#!/usr/bin/env python3
"""
EXPLAIN every static SQL statement in the backend against a real database.

Raw SQL in text(...) is invisible to the type checker and the tests: a
statement naming a table or column that does not exist fails only when it
runs. One such query (a `guardians` table that never existed) emptied every
parent's portal. EXPLAIN plans a statement without running it, so this
checks every table and column name and changes nothing.

    DATABASE_URL=postgresql://user:pass@host:port/db python scripts/check_backend_sql.py

Parameters (:name) become NULL, so a failure caused only by a NULL's type is
not reported. Exit status 1 when any statement fails.
"""
import ast
import asyncio
import glob
import io
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "app")
out = []


def literal(node):
    """The string value of a node if it is a plain string or a concatenation of them."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a, b = literal(node.left), literal(node.right)
        if a is not None and b is not None:
            return a + b
    if isinstance(node, ast.JoinedStr):
        return None
    return None


for path in glob.glob(os.path.join(ROOT, "**", "*.py"), recursive=True):
    src = io.open(path, encoding="utf-8").read()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "text" and node.args:
            sql = literal(node.args[0])
            if sql is None:
                arg = node.args[0]
                if isinstance(arg, ast.Name):
                    # text(sql) where sql = "..." assigned just before in the same function
                    for sub in ast.walk(tree):
                        if isinstance(sub, ast.Assign) and any(getattr(t, "id", None) == arg.id for t in sub.targets) \
                                and sub.lineno < node.lineno and node.lineno - sub.lineno < 60:
                            v = literal(sub.value)
                            if v is not None:
                                sql = v
            if not sql:
                continue
            s = sql.strip().rstrip(";")
            head = s.split(None, 1)[0].upper() if s else ""
            if head not in ("SELECT", "INSERT", "UPDATE", "DELETE", "WITH"):
                continue
            # :name -> NULL (not ::type casts)
            s2 = re.sub(r"(?<![:\w]):([A-Za-z_]\w*)", "NULL", s)
            out.append({"where": f"{os.path.relpath(path, ROOT)}:{node.lineno}", "sql": s2})



async def main() -> int:
    import asyncpg

    url = os.environ.get("DATABASE_URL", "")
    url = re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)
    if not url:
        print("Set DATABASE_URL.")
        return 2
    conn = await asyncpg.connect(url, timeout=20)
    bad = []
    for it in out:
        try:
            async with conn.transaction():
                await conn.execute("EXPLAIN " + it["sql"])
                raise asyncpg.exceptions.PostgresError("rollback")
        except asyncpg.exceptions.PostgresError as e:
            msg = str(e)
            if msg == "rollback":
                continue
            if re.search(r"could not determine data type|is not unique|cannot cast type unknown|"
                         r"must not return a set|NULL|polymorphic type", msg):
                continue
            bad.append((it["where"], msg.splitlines()[0][:200] if msg else ""))
    await conn.close()
    for where, msg in sorted(bad):
        print(f"{where}: {msg}")
    print(f"{len(bad)} of {len(out)} statements fail")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
