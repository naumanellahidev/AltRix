#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio
from app.database import AsyncSessionLocal
from app.routers.teachers import list_teachers
from uuid import UUID

class FakeUser:
    def __init__(self):
        self.user_id = UUID('6e3e1047-c839-4e86-9be6-3131ca8ad474')
        self.id = self.user_id
        self.school_id = UUID('70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8')
        self.campus_id = None
        self.role = 'principal'

async def check():
    async with AsyncSessionLocal() as session:
        u = FakeUser()
        res = await list_teachers(current_user=u, db=session, page=1, page_size=50, search=None, campus_id=None)
        print(f"=== LIVE /teachers ENDPOINT TOTAL: {res.total} ===")
        for t in res.data:
            print(f"  Teacher: {t.first_name} {t.last_name} (ID: {t.id}, Designation: {t.designation})")

asyncio.run(check())
"""

p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo docker exec -i altrix_backend python"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=test_script)
print("=== LIVE /teachers TEST RESULT ===")
print(out)
if err:
    print("ERR:\n", err)
