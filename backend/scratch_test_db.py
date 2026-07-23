import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.models.people import Student, TeacherProfile

async def main():
    async with AsyncSessionLocal() as session:
        res_stu = await session.execute(select(Student))
        students = res_stu.scalars().all()
        print("Total Students in DB:", len(students))
        for s in students:
            print(f"Student: id={s.id}, name='{s.first_name} {s.last_name}', roll='{s.roll_number}', school_id={s.school_id}")

        res_teach = await session.execute(select(TeacherProfile))
        teachers = res_teach.scalars().all()
        print("Total Teachers in DB:", len(teachers))
        for t in teachers:
            print(f"Teacher: id={t.id}, name='{t.first_name} {t.last_name}', school_id={t.school_id}")

if __name__ == "__main__":
    asyncio.run(main())
