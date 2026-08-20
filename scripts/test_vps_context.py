# -*- coding: utf-8 -*-
import asyncio
from app.database import AsyncSessionLocal
from app.utils.ai_context_builder import build_scoped_ai_context

class MockUser:
    def __init__(self, uid, email, roles, sid):
        self.id = uid
        self.email = email
        self.roles = roles
        self.school_id = sid
        self.is_super_admin = False

async def main():
    sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
    user = MockUser("6e3e1047-c839-4e86-9be6-3131ca8ad474", "principal@beaconhouse.edu.pk", ["principal"], sid)
    async with AsyncSessionLocal() as db:
        ctx = await build_scoped_ai_context(db=db, user=user, school_id=sid, user_query="Class 3 ko jo teachers assign hain unke naam batao.")
        print("=== TARGETED SEARCH & RELATIONAL RECORDS IN CONTEXT ===")
        for line in ctx.splitlines():
            if any(k in line for k in ["Targeted Search", "Class-to-Teacher", "Class 3", "Class 1", "Assigned", "NO TEACHERS"]):
                print(line)

if __name__ == "__main__":
    asyncio.run(main())
