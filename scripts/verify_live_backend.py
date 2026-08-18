#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio, uuid, datetime
from app.database import AsyncSessionLocal
from app.models.core import School
from app.models.library import LibraryBook, BookIssue
from sqlalchemy import select, text

async def check():
    async with AsyncSessionLocal() as session:
        # Find beacon school
        res = await session.execute(select(School).where(School.slug == 'beacon'))
        school = res.scalar_one_or_none()
        print('School:', school.name if school else 'None')

        # Find book
        res_b = await session.execute(select(LibraryBook).where(LibraryBook.school_id == school.id).limit(1))
        book = res_b.scalar_one_or_none()
        print('Book:', book.title if book else 'None')

        # Insert issue
        test_issue = BookIssue(
            school_id=school.id,
            book_id=book.id,
            borrower_id=uuid.uuid4(),
            borrower_type="student",
            issue_date=datetime.date(2026, 8, 18),
            due_date=datetime.date(2026, 9, 1),
            fine_amount=0.00,
            fine_per_day=20.00,
            fine_paid=False,
            status="issued"
        )
        session.add(test_issue)
        await session.commit()
        await session.refresh(test_issue)
        print(f'SUCCESS: Test BookIssue created with ID {test_issue.id}, fine_per_day={test_issue.fine_per_day}, status={test_issue.status}')
        
        # Clean up
        await session.delete(test_issue)
        await session.commit()
        print('SUCCESS: Cleaned up test record cleanly!')

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
print("=== LIVE ORM INSERTION TEST ===")
print("STDOUT:\n", out)
print("STDERR:\n", err)
print("EXIT CODE:", p.returncode)
