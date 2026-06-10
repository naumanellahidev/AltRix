import asyncio
import datetime
from sqlalchemy import text
from app.database import get_db_context

async def main():
    async with get_db_context() as db:
        # 1. Fetch a school_id from schools table
        res = await db.execute(text("SELECT id FROM schools LIMIT 1"))
        school_row = res.fetchone()
        if not school_row:
            print("No schools found in the database.")
            return
        school_id = school_row[0]
        print(f"Testing with school_id: {school_id}")

        python_day = datetime.datetime.now().weekday()
        js_day = (python_day + 1) % 7
        today_iso = datetime.date.today().isoformat()
        print(f"python_day: {python_day}, js_day: {js_day}, today_iso: {today_iso}")

        try:
            # 1. Fetch periods
            print("Fetching periods...")
            periods_sql = """
                SELECT id, label, start_time, end_time, sort_order, is_break FROM timetable_periods
                WHERE school_id = :school_id
                ORDER BY sort_order
            """
            periods_res = await db.execute(text(periods_sql), {"school_id": school_id})
            periods = periods_res.fetchall()
            print(f"Fetched {len(periods)} periods.")
        except Exception as e:
            print("Error fetching periods:", e)

        try:
            # 2. Fetch timetable entries
            print("Fetching timetable entries...")
            entries_sql = """
                SELECT id, subject_name, teacher_user_id, class_section_id, room, period_id, day_of_week, start_time, end_time
                FROM timetable_entries
                WHERE school_id = :school_id AND day_of_week = :day
            """
            entries_res = await db.execute(text(entries_sql), {"school_id": school_id, "day": js_day})
            entries = entries_res.fetchall()
            print(f"Fetched {len(entries)} timetable entries.")
        except Exception as e:
            print("Error fetching timetable entries:", e)

        try:
            # 3. Fetch class sections
            print("Fetching class sections...")
            sections_sql = """
                SELECT cs.id, cs.name, ac.name FROM class_sections cs
                LEFT JOIN academic_classes ac ON cs.class_id = ac.id
                WHERE cs.school_id = :school_id
            """
            sections_res = await db.execute(text(sections_sql), {"school_id": school_id})
            sections = sections_res.fetchall()
            print(f"Fetched {len(sections)} class sections.")
        except Exception as e:
            print("Error fetching class sections:", e)

        try:
            # 4. Fetch teachers directory
            print("Fetching teachers directory...")
            teachers_sql = """
                SELECT DISTINCT p.id, p.full_name, p.email FROM profiles p
                JOIN user_roles r ON p.id = r.user_id
                WHERE r.school_id = :school_id
            """
            teachers_res = await db.execute(text(teachers_sql), {"school_id": school_id})
            teachers = teachers_res.fetchall()
            print(f"Fetched {len(teachers)} teachers.")
        except Exception as e:
            print("Error fetching teachers directory:", e)

        try:
            # 5. Fetch presence rows
            print("Fetching presence rows...")
            presence_sql = """
                SELECT timetable_entry_id, status, entered_at, left_at, updated_at, reason FROM teacher_period_presence
                WHERE school_id = :school_id AND period_date = :today
            """
            presence_res = await db.execute(
                text(presence_sql),
                {"school_id": school_id, "today": today_iso}
            )
            rows = presence_res.fetchall()
            print(f"Fetched {len(rows)} presence rows.")
            
            presence_rows = {
                str(r[0]): {
                    "status": r[1],
                    "entered_at": r[2].isoformat() if r[2] and hasattr(r[2], "isoformat") else str(r[2]) if r[2] else None,
                    "left_at": r[3].isoformat() if r[3] and hasattr(r[3], "isoformat") else str(r[3]) if r[3] else None,
                    "updated_at": r[4].isoformat() if r[4] and hasattr(r[4], "isoformat") else str(r[4]) if r[4] else None,
                    "reason": r[5],
                }
                for r in rows
            }
            print("Successfully processed presence rows.")
        except Exception as e:
            print("Error fetching presence rows:", e)

if __name__ == "__main__":
    asyncio.run(main())
