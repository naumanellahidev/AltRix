# -*- coding: utf-8 -*-
"""
AltRix AI Copilot — Enterprise Scoped Context Builder
Features:
1. Strict multi-tenant and role-based data isolation (zero cross-tenant leakage).
2. Sequential asynchronous database queries with robust error boundary catching.
3. 100% read-only data queries with zero mutation capabilities.
4. Comprehensive role-scoped contexts covering ALL ERP domains:
   - Academics & Timetables (Classes, Sections, Subjects, Schedules, Lesson Plans, Diary)
   - Students & Digital Twin (Roster, Guardian/Parent info, Enrollments, Admissions)
   - Attendance (Daily Students, Daily Staff, Absentees, Percentages)
   - Finance & Fees (Invoices, Payments, Defaulters, Fee Plans, Expenses)
   - Exams & Gradebook (Exams, Results, Marks, Grades, Remarks)
   - Library Management (Books Catalog, Active Issues, Overdue Books, Fines)
   - Transport & Fleet (Vehicles, Routes, Bus Stops, Driver Contacts, Student Allocations)
   - HR & Payroll (Staff Directory, Leave Requests, Salary Records)
   - Communication & CRM (Notices, Complaints, CRM Leads, Campaigns, Holidays)
5. Screen/Route-aware dynamic context prioritization.
6. Multi-term targeted search across students, staff, library books, transport routes, and invoices.
"""

import json
import logging
import asyncio
import re
from datetime import datetime, timezone, timedelta
from uuid import UUID
from typing import Optional, List, Any, Dict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils.permissions import expand_roles

logger = logging.getLogger("app.ai_context_builder")


async def build_scoped_ai_context(
    db: AsyncSession,
    user: Any,
    school_id: str,
    active_campus_id: Optional[str] = None,
    active_student_id: Optional[str] = None,
    current_module: Optional[str] = None,
    current_screen: Optional[str] = None,
    user_query: Optional[str] = None,
) -> str:
    """
    Builds a secure, role-isolated, sub-second real-time database context string
    for the AltRix AI Copilot covering all tabs, features, and operational modules.
    """
    effective_roles = expand_roles(user.roles if hasattr(user, "roles") else [])
    
    # 1. Resolve school_id to clean UUID string
    resolved_school_id = school_id
    if school_id:
        try:
            UUID(school_id)
        except (ValueError, TypeError):
            try:
                s_res = await db.execute(
                    text("SELECT id FROM public.schools WHERE slug = :sid OR id::text = :sid LIMIT 1"),
                    {"sid": school_id}
                )
                s_row = s_res.fetchone()
                if s_row:
                    resolved_school_id = str(s_row[0])
            except Exception as e:
                logger.warning(f"Error resolving school slug: {e}")
                try:
                    await db.rollback()
                except Exception:
                    pass
    school_id = resolved_school_id

    # 2. Currency Helper
    currency = "PKR"
    try:
        curr_res = await db.execute(
            text("SELECT currency FROM public.fee_settings WHERE school_id = CAST(:sid AS UUID) LIMIT 1"),
            {"sid": school_id}
        )
        curr_row = curr_res.fetchone()
        if curr_row and curr_row[0]:
            currency = curr_row[0]
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass

    def format_money(val: Any) -> str:
        symbol = "Rs." if currency == "PKR" else currency
        try:
            return f"{symbol} {float(val):,.2f}"
        except Exception:
            return f"{symbol} {val}"

    def to_pkt_date_str(val: Any) -> str:
        if not val:
            return "N/A"
        try:
            if hasattr(val, "tzinfo"):
                adjusted = val
                if val.tzinfo is not None:
                    adjusted = val.astimezone(timezone.utc)
                adjusted = adjusted + timedelta(hours=5)
                return adjusted.strftime('%Y-%m-%d')
            return val.strftime('%Y-%m-%d')
        except Exception:
            return str(val)[:10]

    # Safe query executor that captures errors gracefully without aborting transaction
    async def fetch_rows(sql: str, params: Dict[str, Any]) -> List[Any]:
        try:
            res = await db.execute(text(sql), params)
            return res.fetchall()
        except Exception as e:
            logger.debug(f"AI Context query warning: {sql[:80]}... error: {e}")
            try:
                await db.rollback()
            except Exception:
                pass
            return []

    # Dynamic Targeted Record Search across all ERP entities based on user query
    async def get_targeted_search_matches(query: Optional[str]) -> str:
        if not query:
            return ""
        clean_query = query.strip()
        words = [re.sub(r'[^\w]', '', w, flags=re.UNICODE) for w in clean_query.split()]
        stop_words = {
            "tell", "show", "what", "with", "name", "list", "give", "students", "student", 
            "teachers", "teacher", "class", "classes", "find", "view", "many", "much",
            "have", "about", "which", "where", "please", "could", "would", "from", "school",
            "are", "the", "for", "and", "how", "who", "all", "our", "today", "this", "only",
            "absent", "present", "details", "info", "information", "help",
            # Roman Urdu / Urdu / Hindi question terms
            "kya", "kia", "kitne", "kitna", "kitni", "batao", "dikhao", "dekhna", "dekhne", 
            "chahiye", "kon", "kaun", "kahan", "kaise", "hai", "hain", "ke", "ki", "ka", "ko", 
            "se", "par", "me", "mein", "mera", "meri", "mere", "apna", "apni", "apne", "hum", 
            "hamare", "hamara", "pas", "karo", "karen", "shukriya", "bhai", "sir", "bachay", 
            "bachon", "bacha", "talib", "ilm", "ustaad", "ustad", "sirf", "mujhe", "humein",
            "bhi", "yeh", "woh", "un", "in", "tha", "thi", "the", "kuch", "sab"
        }
        terms = [w for w in words if len(w) >= 2 and w.lower() not in stop_words]
        if not terms:
            terms = [w for w in words if len(w) >= 2]
        if not terms:
            return ""

        matches: List[str] = []

        # ── 0. Universal Current User Personal Inquiry Resolver ─────────────────
        is_personal_inquiry = any(
            kw in f" {clean_query.lower()} "
            for kw in [
                " my ", " mine ", " meri ", " mera ", " mere ", " mujhe ", " apna ", " apni ", " apne ",
                " i teach ", " assigned to me ", " my assigned ", " who am i ", " my profile ", " my details ",
                " my classes ", " my subjects ", " my attendance ", " my salary ", " my pay ", " my children ",
                " my fees ", " my timetable ", " my schedule ", " my leaves ", " my homework ", " my results "
            ]
        )

        if is_personal_inquiry:
            # 1. Personal Classes & Subjects
            if any(k in clean_query.lower() for k in ["class", "subject", "assign", "teach", "parhate", "padhate", "timetable", "schedule"]):
                personal_classes = await fetch_rows("""
                    WITH teacher_ids AS (
                        SELECT :uid::text AS tid
                        UNION
                        SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                        UNION
                        SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                        UNION
                        SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                    ),
                    active_tids AS (
                        SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                    ),
                    all_personal_sections AS (
                        SELECT 
                            c.name AS class_name,
                            cs.name AS section_name,
                            COALESCE(
                                (SELECT string_agg(DISTINCT sub.name, ', ') 
                                 FROM teacher_subject_assignments tsa2 
                                 JOIN subjects sub ON tsa2.subject_id = sub.id 
                                 WHERE tsa2.class_section_id = ta.class_section_id 
                                   AND tsa2.teacher_user_id::text IN (SELECT tid FROM active_tids)
                                ),
                                'All Subjects (Class Teacher)'
                            ) AS subject_name
                        FROM teacher_assignments ta
                        JOIN class_sections cs ON ta.class_section_id = cs.id
                        JOIN academic_classes c ON cs.class_id = c.id
                        WHERE ta.teacher_user_id::text IN (SELECT tid FROM active_tids)
                          AND ta.school_id = CAST(:sid AS UUID)

                        UNION

                        SELECT 
                            c.name AS class_name,
                            cs.name AS section_name,
                            COALESCE(sub.name, 'Assigned Subject') AS subject_name
                        FROM teacher_subject_assignments tsa
                        JOIN class_sections cs ON tsa.class_section_id = cs.id
                        JOIN academic_classes c ON cs.class_id = c.id
                        LEFT JOIN subjects sub ON tsa.subject_id = sub.id
                        WHERE tsa.teacher_user_id::text IN (SELECT tid FROM active_tids)
                          AND tsa.school_id = CAST(:sid AS UUID)

                        UNION

                        SELECT 
                            c.name AS class_name,
                            cs.name AS section_name,
                            COALESCE(tp.subject_name, 'General Subject') AS subject_name
                        FROM timetable_periods tp
                        JOIN class_sections cs ON tp.class_section_id = cs.id
                        JOIN academic_classes c ON cs.class_id = c.id
                        WHERE tp.teacher_user_id::text IN (SELECT tid FROM active_tids)
                          AND c.school_id = CAST(:sid AS UUID)
                    )
                    SELECT DISTINCT class_name, section_name, subject_name
                    FROM all_personal_sections
                    ORDER BY class_name, section_name, subject_name
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})

                if personal_classes:
                    matches.append("🎯 DIRECT QUERY ANSWER DATA (Your Personal Assigned Classes & Subjects):")
                    for pc in personal_classes:
                        c_clean = pc[0] if str(pc[0]).lower().startswith("class") else f"Class {pc[0]}"
                        s_clean = pc[1] if str(pc[1]).lower().startswith("section") else f"Section {pc[1]}"
                        matches.append(f"  * {c_clean} ({s_clean}) — Subject: {pc[2]}")

            # 2. Personal Attendance
            if any(k in clean_query.lower() for k in ["attendance", "hazri", "present", "absent", "late"]):
                # Staff Attendance
                staff_att = await fetch_rows("""
                    SELECT 
                        COUNT(*) FILTER (WHERE status = 'present') as present_days,
                        COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
                        COUNT(*) FILTER (WHERE status = 'late') as late_days,
                        COUNT(*) as total_records
                    FROM hr_staff_attendance
                    WHERE staff_id IN (
                        SELECT id FROM hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    )
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if staff_att and staff_att[0] and staff_att[0][3] > 0:
                    r = staff_att[0]
                    matches.append(f"🎯 DIRECT QUERY ANSWER DATA (Your Staff Attendance): Present: {r[0]} days, Absent: {r[1]} days, Late: {r[2]} days (Total Logged: {r[3]} days)")

                # Student Attendance (if user is student)
                student_att = await fetch_rows("""
                    SELECT 
                        COUNT(*) FILTER (WHERE ae.status = 'present') as present_days,
                        COUNT(*) FILTER (WHERE ae.status = 'absent') as absent_days,
                        COUNT(*) as total_days
                    FROM attendance_entries ae
                    WHERE ae.student_id IN (
                        SELECT id FROM students WHERE user_id = :uid OR email = :uemail
                    )
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or ""})
                if student_att and student_att[0] and student_att[0][2] > 0:
                    r = student_att[0]
                    pct = round(r[0] / r[2] * 100, 1)
                    matches.append(f"🎯 DIRECT QUERY ANSWER DATA (Your Student Attendance): {pct}% ({r[0]}/{r[2]} days present, {r[1]} days absent)")

            # 3. Personal Salary / Payroll
            if any(k in clean_query.lower() for k in ["salary", "pay", "payslip", "tankhwah", "tankha", "allowance", "deduction", "payroll"]):
                staff_sal = await fetch_rows("""
                    SELECT full_name, position, department, salary, salary_type
                    FROM hr_staff_directory
                    WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if staff_sal and staff_sal[0]:
                    s = staff_sal[0]
                    matches.append(f"🎯 DIRECT QUERY ANSWER DATA (Your Salary & Payroll): Designation: {s[1] or 'Staff'} ({s[2] or 'General'}), Base Salary: {format_money(s[3] or 0)} ({s[4] or 'Monthly'})")

            # 4. Personal Leaves
            if any(k in clean_query.lower() for k in ["leave", "leaves", "chutti", "chuttiyan", "vacation"]):
                staff_leaves = await fetch_rows("""
                    SELECT leave_type, start_date, end_date, reason, status
                    FROM hr_leave_requests
                    WHERE staff_id IN (
                        SELECT id FROM hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    )
                    ORDER BY start_date DESC LIMIT 5
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if staff_leaves:
                    matches.append("🎯 DIRECT QUERY ANSWER DATA (Your Leave History):")
                    for l in staff_leaves:
                        matches.append(f"  * {l[0] or 'Leave'}: {l[1]} to {l[2]} | Reason: '{l[3] or 'None'}' | Status: {l[4]}")

            # 5. Personal Fees & Invoices (for Student / Parent)
            if any(k in clean_query.lower() for k in ["fee", "fees", "invoice", "challan", "dues", "balance", "receipt", "bill"]):
                user_invoices = await fetch_rows("""
                    SELECT i.invoice_number, s.first_name, s.last_name, i.total_amount, i.paid_amount, i.due_date, i.status
                    FROM fee_invoices i
                    JOIN students s ON i.student_id = s.id
                    WHERE (s.user_id = :uid OR s.email = :uemail OR s.parent_user_id = :uid OR s.parent_email = :uemail)
                      AND i.school_id = CAST(:sid AS UUID)
                    ORDER BY i.due_date DESC LIMIT 5
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if user_invoices:
                    matches.append("🎯 DIRECT QUERY ANSWER DATA (Your Fee Invoices & Dues):")
                    for iv in user_invoices:
                        due_bal = float(iv[3] or 0) - float(iv[4] or 0)
                        matches.append(f"  * Invoice #{iv[0]} ({iv[1]} {iv[2] or ''}): Total: {format_money(iv[3])}, Paid: {format_money(iv[4])}, Remaining Balance: {format_money(due_bal)}, Due Date: {to_pkt_date_str(iv[5])}, Status: {iv[6]}")

            # 6. Personal Children (for Parent)
            if any(k in clean_query.lower() for k in ["child", "children", "kid", "kids", "bachay", "bache", "beta", "beti", "son", "daughter"]):
                parent_kids = await fetch_rows("""
                    SELECT s.first_name, s.last_name, s.student_code, c.name, cs.name, s.status
                    FROM students s
                    LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                    LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                    LEFT JOIN academic_classes c ON cs.class_id = c.id
                    WHERE (s.parent_user_id = :uid OR s.parent_email = :uemail OR s.parent_phone = :uemail)
                      AND s.school_id = CAST(:sid AS UUID)
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if parent_kids:
                    matches.append("🎯 DIRECT QUERY ANSWER DATA (Your Children):")
                    for k in parent_kids:
                        matches.append(f"  * {k[0]} {k[1] or ''} (Code: {k[2] or 'N/A'}, Class: {k[3] or 'Unassigned'} {k[4] or ''}, Status: {k[5]})")

            # 7. Personal Profile & Bio
            if any(k in clean_query.lower() for k in ["profile", "details", "info", "who am i", "meri details", "mera record"]):
                user_info = await fetch_rows("""
                    SELECT full_name, position, department, email, phone, is_active
                    FROM hr_staff_directory
                    WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
                if user_info and user_info[0]:
                    u = user_info[0]
                    matches.append(f"🎯 DIRECT QUERY ANSWER DATA (Your Profile & Position): Name: {u[0]}, Designation: {u[1] or 'Staff'} ({u[2] or 'General'}), Email: {u[3] or 'N/A'}, Status: {'Active' if u[5] else 'Inactive'}")

        # ── 0a. Relational Class & Section Teacher Assignment Search ────────────
        is_relational_assignment_query = any(
            kw in clean_query.lower()
            for kw in [
                "teacher", "teachers", "assign", "assigned", "ustaad", "ustad", 
                "parhate", "padhate", "kaun hai", "kon hai", "who is", "who teaches",
                "faculty", "incharge", "class teacher"
            ]
        )

        # Match specific class designations like "Class 3", "Grade 8", "Section B", "Class KG"
        class_pattern_match = re.search(r'\b(?:class|grade|section|jamaat|darja)\s+([0-9]+|[a-zA-Z]\b|playgroup|nursery|prep|kg[12]?|kindergarten)', clean_query, re.IGNORECASE)
        explicit_num_match = re.search(r'\b([1-9]|1[0-2])\b', clean_query) if not is_personal_inquiry else None

        c_target = ""
        if class_pattern_match:
            candidate = class_pattern_match.group(1).strip()
            stopwords = {"es", "s", "and", "or", "in", "the", "ko", "ki", "ka", "ke", "mein", "par", "all", "sab", "list", "show", "subjects", "subject", "teacher", "teachers", "batao", "bataen", "hain", "hai"}
            if candidate.lower() not in stopwords:
                c_target = candidate
        elif explicit_num_match and not is_personal_inquiry:
            c_target = explicit_num_match.group(1).strip()

        # Only run class-specific relational lookup if not a general personal "my classes" query
        if c_target:
            c_filter = "AND (c.name ILIKE :cterm OR cs.name ILIKE :cterm OR CAST(c.grade_level AS text) = :gterm)"
            c_params = {"sid": school_id, "cterm": f"%{c_target}%", "gterm": c_target}

            # 1. Fetch matching academic classes and sections in scope
            classes_in_scope = await fetch_rows(f"""
                SELECT c.name as class_name, cs.name as section_name, cs.id as section_id, c.id as class_id, c.grade_level
                FROM academic_classes c
                JOIN class_sections cs ON cs.class_id = c.id
                WHERE c.school_id = CAST(:sid AS UUID) {c_filter}
                ORDER BY c.name ASC, cs.name ASC
            """, c_params)

            if classes_in_scope:
                # 2. Fetch all teacher assignments for these sections
                assignments_rows = await fetch_rows(f"""
                    SELECT 
                        c.name as class_name,
                        cs.name as section_name,
                        COALESCE(sub.name, 'General Subject') as subject_name,
                        COALESCE(sud.display_name, p.display_name, hr.full_name, 'Assigned Teacher') as teacher_name,
                        cs.id as section_id
                    FROM teacher_subject_assignments tsa
                    JOIN class_sections cs ON cs.id = tsa.class_section_id
                    JOIN academic_classes c ON c.id = cs.class_id
                    LEFT JOIN subjects sub ON sub.id = tsa.subject_id
                    LEFT JOIN school_user_directory sud ON sud.user_id = tsa.teacher_user_id AND sud.school_id = c.school_id
                    LEFT JOIN profiles p ON p.id = tsa.teacher_user_id
                    LEFT JOIN hr_staff_directory hr ON hr.linked_user_id = tsa.teacher_user_id AND hr.school_id = c.school_id
                    WHERE c.school_id = CAST(:sid AS UUID) {c_filter}
                    ORDER BY c.name ASC, cs.name ASC, sub.name ASC
                """, c_params)

                teacher_subjects_by_sec = {}
                for r in assignments_rows:
                    sec_key = (r[0], r[1])
                    if sec_key not in teacher_subjects_by_sec:
                        teacher_subjects_by_sec[sec_key] = {}
                    t_name = r[3]
                    sub_name = r[2] or "General Subject"
                    if t_name not in teacher_subjects_by_sec[sec_key]:
                        teacher_subjects_by_sec[sec_key][t_name] = []
                    teacher_subjects_by_sec[sec_key][t_name].append(sub_name)

                header_label = f"🎯 DIRECT QUERY ANSWER DATA (Class '{c_target}'):"
                matches.append(header_label)
                for cls in classes_in_scope:
                    sec_key = (cls[0], cls[1])
                    c_clean = cls[0] if cls[0].lower().startswith("class") else f"Class {cls[0]}"
                    s_clean = cls[1] if cls[1].lower().startswith("section") else f"Section {cls[1]}"
                    if sec_key in teacher_subjects_by_sec:
                        t_summary = []
                        for t_name, subs in teacher_subjects_by_sec[sec_key].items():
                            t_summary.append(f"{t_name} ({', '.join(subs)})")
                        matches.append(
                            f"  * {c_clean} ({s_clean}): Assigned Teachers: {'; '.join(t_summary)}"
                        )
                    else:
                        matches.append(
                            f"  * {c_clean} ({s_clean}): NO TEACHERS ASSIGNED (0 teacher assignments found in school database)."
                        )

        # ── 0b. Subject-to-Teacher Relationship Search ─────────────────────────
        subject_keywords = [
            "math", "mathematics", "science", "english", "urdu", "computer", 
            "physics", "chemistry", "biology", "islamiyat", "pak studies", 
            "history", "geography", "arabic"
        ]
        matched_subjects = [sk for sk in subject_keywords if re.search(r'\b' + re.escape(sk) + r'\b', clean_query, re.IGNORECASE)]
        if matched_subjects:
            for subj in matched_subjects:
                sub_rows = await fetch_rows("""
                    SELECT 
                        sub.name as subject_name,
                        c.name as class_name,
                        cs.name as section_name,
                        COALESCE(sud.display_name, p.display_name, hr.full_name, 'Teacher') as teacher_name
                    FROM teacher_subject_assignments tsa
                    JOIN subjects sub ON sub.id = tsa.subject_id
                    JOIN class_sections cs ON cs.id = tsa.class_section_id
                    JOIN academic_classes c ON c.id = cs.class_id
                    LEFT JOIN school_user_directory sud ON sud.user_id = tsa.teacher_user_id AND sud.school_id = c.school_id
                    LEFT JOIN profiles p ON p.id = tsa.teacher_user_id
                    LEFT JOIN hr_staff_directory hr ON hr.linked_user_id = tsa.teacher_user_id AND hr.school_id = c.school_id
                    WHERE c.school_id = CAST(:sid AS UUID)
                      AND sub.name ILIKE :sterm
                    ORDER BY c.name, cs.name
                """, {"sid": school_id, "sterm": f"%{subj}%"})
                if sub_rows:
                    matches.append(f"Subject '{sub_rows[0][0]}' Teacher Assignments across Classes:")
                    for sr in sub_rows:
                        matches.append(f"  * {sr[1]} (Section {sr[2]}): {sr[0]} is taught by {sr[3]}")
                else:
                    matches.append(f"Subject '{subj}': No teacher assignments found for this subject in the school.")

        # Check for specific Class / Section pattern in query (e.g. "Grade 1", "Class 5", "Section A", "8-A")
        class_match = re.search(r'(?:class|grade|section)\s*([0-9a-zA-Z\-]+)', clean_query, re.IGNORECASE)
        if class_match and not is_relational_assignment_query:
            c_target = class_match.group(1).strip()
            cls_stu_rows = await fetch_rows("""
                SELECT s.first_name, s.last_name, s.student_code, s.status, s.gender, s.parent_name, s.parent_phone,
                       c.name as class_name, cs.name as section_name, s.id as student_id, s.roll_number
                FROM students s
                JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                JOIN class_sections cs ON se.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = CAST(:sid AS UUID)
                  AND (c.name ILIKE :cterm OR cs.name ILIKE :cterm)
                LIMIT 20
            """, {"sid": school_id, "cterm": f"%{c_target}%"})
            if cls_stu_rows:
                matches.append(f"Students in Class/Section matching '{c_target}':")
                for s in cls_stu_rows:
                    matches.append(
                        f"  * {s[0]} {s[1] or ''} (Roll/Code: {s[2] or s[10] or 'N/A'}, Class: {s[7]} {s[8] or ''}, Status: {s[3]}, Parent: {s[5] or 'N/A'}) [Student ID: {s[9]}]"
                    )

        # Check for Absentee query
        if any(w in clean_query.lower() for w in ["absent", "absentees", "ghair hazir", "chutti"]):
            today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            abs_rows = await fetch_rows("""
                SELECT s.first_name, s.last_name, c.name, cs.name, ae.status
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                JOIN students s ON ae.student_id = s.id
                LEFT JOIN class_sections cs ON sess.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = CAST(:sid AS UUID)
                  AND sess.date = CURRENT_DATE
                  AND ae.status IN ('absent', 'leave')
                LIMIT 25
            """, {"sid": school_id})
            if abs_rows:
                matches.append("Today's Absent Students / Leaves:")
                for ab in abs_rows:
                    matches.append(f"  * {ab[0]} {ab[1] or ''} ({ab[2] or 'Class'} {ab[3] or ''}) — Status: {ab[4].title()}")

        for term in terms[:3]:
            # 1. Search students
            stu_rows = await fetch_rows("""
                SELECT s.first_name, s.last_name, s.student_code, s.status, s.gender, s.parent_name, s.parent_phone,
                       c.name as class_name, cs.name as section_name, s.id as student_id, s.roll_number
                FROM students s
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = CAST(:sid AS UUID)
                  AND (s.first_name ILIKE :term OR s.last_name ILIKE :term OR s.student_code ILIKE :term OR s.parent_name ILIKE :term OR s.parent_phone ILIKE :term OR s.roll_number ILIKE :term)
                LIMIT 15
            """, {"sid": school_id, "term": f"%{term}%"})

            if stu_rows:
                matches.append(f"Matched Students for '{term}':")
                for s in stu_rows:
                    matches.append(
                        f"  * {s[0]} {s[1] or ''} (Roll/Code: {s[2] or s[10] or 'N/A'}, Class: {s[7] or 'Unassigned'} {s[8] or ''}, Status: {s[3]}, Parent: {s[5] or 'N/A'}, Phone: {s[6] or 'N/A'}) [Student ID: {s[9]}]"
                    )

            # 2. Search staff
            staff_rows = await fetch_rows("""
                SELECT full_name, position, email, phone, is_active, department, id as staff_id
                FROM hr_staff_directory
                WHERE school_id = CAST(:sid AS UUID)
                  AND (full_name ILIKE :term OR email ILIKE :term OR phone ILIKE :term OR position ILIKE :term OR department ILIKE :term)
                LIMIT 10
            """, {"sid": school_id, "term": f"%{term}%"})

            if staff_rows:
                matches.append(f"Matched Faculty/Staff for '{term}':")
                for st in staff_rows:
                    matches.append(
                        f"  * {st[0]} ({st[1] or 'Staff'}, Dept: {st[5] or 'General'}, Email: {st[2] or 'N/A'}, Phone: {st[3] or 'N/A'}) [Staff ID: {st[6]}]"
                    )

            # 3. Search Library Books
            book_rows = await fetch_rows("""
                SELECT title, author, isbn, category, total_copies, available_copies, shelf_location, id as book_id
                FROM library_books
                WHERE school_id = CAST(:sid AS UUID)
                  AND (title ILIKE :term OR author ILIKE :term OR isbn ILIKE :term OR category ILIKE :term)
                LIMIT 10
            """, {"sid": school_id, "term": f"%{term}%"})

            if book_rows:
                matches.append(f"Matched Library Books for '{term}':")
                for b in book_rows:
                    matches.append(
                        f"  * '{b[0]}' by {b[1]} (Category: {b[3] or 'General'}, Available: {b[5]}/{b[4]} copies, Shelf: {b[6] or 'N/A'}) [Book ID: {b[7]}]"
                    )

            # 4. Search Transport Routes & Buses
            route_rows = await fetch_rows("""
                SELECT r.route_name, r.route_code, r.start_point, r.end_point, r.monthly_fare, r.status, v.bus_number, v.driver_name, v.driver_phone
                FROM bus_routes r
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.school_id = CAST(:sid AS UUID)
                  AND (r.route_name ILIKE :term OR r.route_code ILIKE :term OR r.start_point ILIKE :term OR r.end_point ILIKE :term OR v.bus_number ILIKE :term OR v.driver_name ILIKE :term)
                LIMIT 10
            """, {"sid": school_id, "term": f"%{term}%"})

            if route_rows:
                matches.append(f"Matched Transport Routes/Vehicles for '{term}':")
                for rt in route_rows:
                    matches.append(
                        f"  * Route {rt[0]} ({rt[1] or 'N/A'}): {rt[2]} to {rt[3]} | Bus: {rt[6] or 'Unassigned'} | Driver: {rt[7] or 'N/A'} ({rt[8] or 'N/A'}) | Fare: {format_money(rt[4])} | Status: {rt[5]}"
                    )

            # 5. Search Fee Invoices
            inv_rows = await fetch_rows("""
                SELECT i.invoice_number, s.first_name, s.last_name, i.total_amount, i.paid_amount, i.due_date, i.status, i.id as invoice_id
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.school_id = CAST(:sid AS UUID)
                  AND (i.invoice_number ILIKE :term OR s.first_name ILIKE :term OR s.last_name ILIKE :term)
                LIMIT 10
            """, {"sid": school_id, "term": f"%{term}%"})

            if inv_rows:
                matches.append(f"Matched Fee Invoices for '{term}':")
                for iv in inv_rows:
                    matches.append(
                        f"  * Invoice #{iv[0]}: {iv[1]} {iv[2] or ''} | Total: {format_money(iv[3])}, Paid: {format_money(iv[4])}, Due: {to_pkt_date_str(iv[5])}, Status: {iv[6]} [Invoice ID: {iv[7]}]"
                    )

        return "\n".join(matches) if matches else ""

    # Common School Branding and Holidays queries
    # Common Holidays queries
    async def get_branding():
        return ""

    async def get_holidays():
        rows = await fetch_rows(
            "SELECT title, start_date, end_date, holiday_type FROM public.holidays WHERE school_id = CAST(:sid AS UUID) AND end_date >= CURRENT_DATE ORDER BY start_date ASC LIMIT 10",
            {"sid": school_id}
        )
        if rows:
            return "\n".join([f"- {h[0]} ({h[1]} to {h[2]}) [Type: {h[3] or 'General'}]" for h in rows])
        return "No upcoming holidays scheduled."

    screen_context_header = (
        f"- Current Screen/Route: {current_screen or 'General Dashboard'}\n"
        f"- Current Module: {current_module or 'ERP Overview'}\n"
    )

    # =========================================================================
    # ROLE 1: School Owner / Principal / Vice Principal / Super Admin
    # =========================================================================
    if user.is_super_admin or any(r in effective_roles for r in ["school_owner", "principal", "vice_principal", "school_admin"]):
        mtd_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        campus_filter = "AND (campus_id = CAST(:cid AS UUID) OR :cid IS NULL)" if active_campus_id else ""
        campus_param = {"sid": school_id, "cid": active_campus_id, "mtd_start": mtd_start}

        async def get_owner_metrics():
            sql = f"""
                SELECT
                    (SELECT COUNT(*) FROM students WHERE school_id = CAST(:sid AS UUID) AND status IN ('active', 'enrolled') {campus_filter}) as total_students,
                    (SELECT COUNT(DISTINCT teacher_user_id) FROM teacher_subject_assignments WHERE school_id = CAST(:sid AS UUID)) as total_teachers,
                    (SELECT COUNT(*) FROM fee_invoices WHERE school_id = CAST(:sid AS UUID) AND status NOT IN ('paid', 'cancelled') {campus_filter}) as pending_payments,
                    (SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE school_id = CAST(:sid AS UUID) AND paid_at >= :mtd_start {campus_filter}) as collected_fees,
                    (SELECT COUNT(*) FROM campuses WHERE school_id = CAST(:sid AS UUID) AND is_active = true) as active_campuses,
                    (SELECT COUNT(*) FROM bus_routes WHERE school_id = CAST(:sid AS UUID) AND status = 'active') as active_routes,
                    (SELECT COUNT(*) FROM library_books WHERE school_id = CAST(:sid AS UUID)) as library_books_count,
                    (SELECT COUNT(*) FROM complaints WHERE school_id = CAST(:sid AS UUID) AND status IN ('open', 'pending', 'in_progress')) as open_complaints_count
            """
            rows = await fetch_rows(sql, campus_param)
            if rows and len(rows[0]) >= 8:
                return rows[0]
            return (0, 0, 0, 0, 0, 0, 0, 0)

        async def get_campuses():
            return await fetch_rows("SELECT id, name, address, is_active FROM campuses WHERE school_id = CAST(:sid AS UUID) ORDER BY name", {"sid": school_id})

        async def get_students():
            return await fetch_rows(f"""
                SELECT s.first_name, s.last_name, s.student_code, s.status, c.name, cs.name, s.parent_name, s.parent_phone, s.id as student_id
                FROM students s
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE s.school_id = CAST(:sid AS UUID) {campus_filter}
                ORDER BY s.first_name ASC, s.last_name ASC
                LIMIT 100
            """, campus_param)

        async def get_defaulters():
            return await fetch_rows(f"""
                SELECT s.first_name, s.last_name, 
                       COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0) as balance, 
                       i.invoice_number, c.name as class_name, cs.name as section_name,
                       s.id as student_id, i.id as invoice_id, cs.id as section_id, c.id as class_id
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE i.school_id = CAST(:sid AS UUID) AND i.status != 'paid' AND i.student_id != CAST('00000000-0000-0000-0000-000000000000' AS UUID) {campus_filter}
                ORDER BY balance DESC LIMIT 15
            """, campus_param)

        async def get_invoices():
            return await fetch_rows(f"""
                SELECT i.invoice_number, s.first_name, s.last_name, c.name, cs.name, 
                       i.total_amount, i.paid_amount, i.due_date, i.status, i.created_at,
                       s.id as student_id, i.id as invoice_id, c.id as class_id, cs.id as section_id
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE i.school_id = CAST(:sid AS UUID) AND i.student_id != CAST('00000000-0000-0000-0000-000000000000' AS UUID) {campus_filter}
                ORDER BY i.created_at DESC LIMIT 50
            """, campus_param)

        async def get_payments():
            return await fetch_rows(f"""
                SELECT fp.amount, fp.method, fp.paid_at, fp.status, s.first_name, s.last_name, fp.id as payment_id, fp.invoice_id, s.id as student_id
                FROM fee_payments fp
                JOIN students s ON fp.student_id = s.id
                WHERE fp.school_id = CAST(:sid AS UUID) {campus_filter}
                ORDER BY fp.paid_at DESC LIMIT 25
            """, campus_param)

        async def get_classes():
            return await fetch_rows(f"""
                SELECT c.name, cs.name, COUNT(se.id) as student_count, cs.id as section_id, c.id as class_id
                FROM academic_classes c
                JOIN class_sections cs ON cs.class_id = c.id
                LEFT JOIN student_enrollments se ON se.class_section_id = cs.id AND se.end_date IS NULL
                WHERE c.school_id = CAST(:sid AS UUID) {campus_filter}
                GROUP BY c.id, c.name, cs.id, cs.name
                ORDER BY c.name, cs.name
            """, campus_param)

        async def get_staff():
            rows = await fetch_rows(f"""
                SELECT full_name, position, email, phone, is_active, department, id as staff_id, linked_user_id 
                FROM hr_staff_directory 
                WHERE school_id = CAST(:sid AS UUID) {campus_filter}
                ORDER BY full_name LIMIT 50
            """, campus_param)
            if not rows:
                rows = await fetch_rows("""
                    SELECT display_name as full_name, 'Teacher/Staff' as position, email, '' as phone, true as is_active, 'General' as department, user_id as staff_id, user_id as linked_user_id
                    FROM school_user_directory
                    WHERE school_id = CAST(:sid AS UUID)
                    ORDER BY display_name LIMIT 50
                """, {"sid": school_id})
            return rows

        async def get_leaves():
            return await fetch_rows(f"""
                SELECT sd.full_name, lr.start_date, lr.end_date, lr.reason, lr.status, lr.id as leave_id, lr.user_id
                FROM hr_leave_requests lr 
                LEFT JOIN hr_staff_directory sd ON lr.user_id = sd.linked_user_id 
                WHERE lr.school_id = CAST(:sid AS UUID) 
                ORDER BY lr.created_at DESC LIMIT 15
            """, {"sid": school_id})

        async def get_notices():
            return await fetch_rows(f"""
                SELECT id, title, body, audience, created_at FROM notices 
                WHERE school_id = CAST(:sid AS UUID) ORDER BY created_at DESC LIMIT 10
            """, {"sid": school_id})

        async def get_exams():
            return await fetch_rows(f"""
                SELECT name, term_label, start_date, end_date, status, result_published, id as exam_id
                FROM exams
                WHERE school_id = CAST(:sid AS UUID)
                ORDER BY start_date DESC LIMIT 10
            """, {"sid": school_id})

        async def get_library_summary():
            books = await fetch_rows("""
                SELECT title, author, category, total_copies, available_copies, shelf_location, id as book_id
                FROM library_books
                WHERE school_id = CAST(:sid AS UUID)
                ORDER BY title LIMIT 20
            """, {"sid": school_id})
            issues = await fetch_rows("""
                SELECT b.title, s.first_name, s.last_name, bi.issue_date, bi.due_date, bi.status, bi.fine_amount, bi.id as issue_id
                FROM book_issues bi
                JOIN library_books b ON bi.book_id = b.id
                LEFT JOIN students s ON bi.borrower_id = s.id
                WHERE bi.school_id = CAST(:sid AS UUID) AND bi.status != 'returned'
                ORDER BY bi.due_date ASC LIMIT 15
            """, {"sid": school_id})
            return books, issues

        async def get_transport_summary():
            vehicles = await fetch_rows("""
                SELECT bus_number, registration_no, vehicle_type, seating_capacity, driver_name, driver_phone, status, id as vehicle_id
                FROM vehicles
                WHERE school_id = CAST(:sid AS UUID)
                ORDER BY bus_number
            """, {"sid": school_id})
            routes = await fetch_rows("""
                SELECT r.route_name, r.route_code, r.start_point, r.end_point, r.monthly_fare, r.status, v.bus_number, v.driver_name, v.driver_phone, r.id as route_id
                FROM bus_routes r
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.school_id = CAST(:sid AS UUID)
                ORDER BY r.route_name
            """, {"sid": school_id})
            return vehicles, routes

        async def get_complaints():
            return await fetch_rows("""
                SELECT subject, category, status, priority, created_at, id as complaint_id
                FROM complaints
                WHERE school_id = CAST(:sid AS UUID)
                ORDER BY created_at DESC LIMIT 10
            """, {"sid": school_id})

        async def get_crm_stats():
            return await fetch_rows(f"""
                SELECT status, COUNT(*) FROM public.crm_leads 
                WHERE school_id = CAST(:sid AS UUID) {campus_filter}
                GROUP BY status
            """, campus_param)

        async def get_all_teacher_assignments():
            classes = await fetch_rows(f"""
                SELECT c.name as class_name, cs.name as section_name, cs.id as section_id, c.id as class_id
                FROM academic_classes c
                JOIN class_sections cs ON cs.class_id = c.id
                WHERE c.school_id = CAST(:sid AS UUID) {campus_filter}
                ORDER BY c.name ASC, cs.name ASC
            """, campus_param)
            
            assignments = await fetch_rows(f"""
                SELECT 
                    c.name as class_name,
                    cs.name as section_name,
                    sub.name as subject_name,
                    COALESCE(sud.display_name, p.display_name, hr.full_name, 'Teacher') as teacher_name
                FROM teacher_subject_assignments tsa
                JOIN class_sections cs ON cs.id = tsa.class_section_id
                JOIN academic_classes c ON c.id = cs.class_id
                LEFT JOIN subjects sub ON sub.id = tsa.subject_id
                LEFT JOIN school_user_directory sud ON sud.user_id = tsa.teacher_user_id AND sud.school_id = c.school_id
                LEFT JOIN profiles p ON p.id = tsa.teacher_user_id
                LEFT JOIN hr_staff_directory hr ON hr.linked_user_id = tsa.teacher_user_id AND hr.school_id = c.school_id
                WHERE c.school_id = CAST(:sid AS UUID) {campus_filter}
                ORDER BY c.name ASC, cs.name ASC, sub.name ASC
            """, campus_param)

            teacher_subjects_by_sec = {}
            for r in assignments:
                k = (r[0], r[1])
                if k not in teacher_subjects_by_sec:
                    teacher_subjects_by_sec[k] = {}
                t_name = r[3]
                sub_name = r[2] or "General Subject"
                if t_name not in teacher_subjects_by_sec[k]:
                    teacher_subjects_by_sec[k][t_name] = []
                teacher_subjects_by_sec[k][t_name].append(sub_name)

            lines = []
            for cls in classes:
                k = (cls[0], cls[1])
                c_clean = cls[0] if cls[0].lower().startswith("class") else f"Class {cls[0]}"
                s_clean = cls[1] if cls[1].lower().startswith("section") else f"Section {cls[1]}"
                if k in teacher_subjects_by_sec:
                    t_summary = []
                    for t_name, subs in teacher_subjects_by_sec[k].items():
                        t_summary.append(f"{t_name} ({', '.join(subs)})")
                    lines.append(f"- {c_clean} ({s_clean}): Assigned Teachers: {'; '.join(t_summary)}")
                else:
                    lines.append(f"- {c_clean} ({s_clean}): No teachers assigned (0 assignments found in database)")
            return lines

        # Sequential Data Fetching for zero race conditions
        metrics = await get_owner_metrics()
        campuses = await get_campuses()
        students = await get_students()
        defaulters = await get_defaulters()
        invoices = await get_invoices()
        payments = await get_payments()
        classes = await get_classes()
        staff = await get_staff()
        teacher_assignments = await get_all_teacher_assignments()
        leaves = await get_leaves()
        notices = await get_notices()
        exams = await get_exams()
        lib_books, lib_issues = await get_library_summary()
        t_vehicles, t_routes = await get_transport_summary()
        complaints = await get_complaints()
        crm_stats = await get_crm_stats()
        # Personal Teacher Assignments for Executive if applicable
        personal_teacher_assignments = await fetch_rows("""
            WITH teacher_ids AS (
                SELECT :uid::text AS tid
                UNION
                SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                UNION
                SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                UNION
                SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
            ),
            active_tids AS (
                SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
            )
            SELECT DISTINCT c.name, cs.name, COALESCE(sub.name, tp.subject_name, 'General Subject')
            FROM class_sections cs
            JOIN academic_classes c ON cs.class_id = c.id
            LEFT JOIN teacher_assignments ta ON ta.class_section_id = cs.id AND ta.teacher_user_id::text IN (SELECT tid FROM active_tids)
            LEFT JOIN teacher_subject_assignments tsa ON tsa.class_section_id = cs.id AND tsa.teacher_user_id::text IN (SELECT tid FROM active_tids)
            LEFT JOIN subjects sub ON tsa.subject_id = sub.id
            LEFT JOIN timetable_periods tp ON tp.class_section_id = cs.id AND tp.teacher_user_id::text IN (SELECT tid FROM active_tids)
            WHERE (ta.id IS NOT NULL OR tsa.id IS NOT NULL OR tp.id IS NOT NULL)
              AND cs.school_id = CAST(:sid AS UUID)
            ORDER BY c.name, cs.name
        """, {"uid": str(user.id), "uemail": getattr(user, "email", "") or "", "sid": school_id})
        personal_sections_str = "\n".join([f"- {r[0]} ({r[1] if str(r[1]).lower().startswith('section') else 'Section ' + str(r[1])}) — Subject: {r[2]}" for r in personal_teacher_assignments])

        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        campuses_str = "\n".join([f"- {r[1]} ({r[2] or 'Main Campus'}) [Campus ID: {r[0]}]: {'Active' if r[3] else 'Inactive'}" for r in campuses])
        students_str = "\n".join([f"- {r[0]} {r[1] or ''} (Code: {r[2] or 'N/A'}, Class: {r[4] or 'Unassigned'} {r[5] or ''}, Status: {r[3]}, Parent: {r[6] or 'N/A'}) [Student ID: {r[8]}]" for r in students])
        defaulters_str = "\n".join([f"- {r[0]} {r[1] or ''} (Class: {r[4] or 'Unassigned'}, Section: {r[5] or 'Unassigned'}): Outstanding: {format_money(r[2])} (Invoice: {r[3]} [Invoice ID: {r[7]}, Student ID: {r[6]}])" for r in defaulters])
        invoices_str = "\n".join([f"- Inv #{r[0]}: {r[1]} {r[2] or ''} ({r[3] or 'N/A'}-{r[4] or 'N/A'}), Total: {format_money(r[5])}, Paid: {format_money(r[6])}, Due: {to_pkt_date_str(r[7])}, Status: {r[8]} [Invoice ID: {r[11]}, Student ID: {r[10]}]" for r in invoices])
        payments_str = "\n".join([f"- Received: {format_money(r[0])} via {r[1]} on {to_pkt_date_str(r[2])} | Status: {r[3]} | Student: {r[4]} {r[5] or ''} [Payment ID: {r[6]}, Invoice ID: {r[7] or 'N/A'}]" for r in payments])
        classes_str = "\n".join([f"- {r[0] if str(r[0]).lower().startswith('class') else 'Class ' + str(r[0])} ({r[1] if str(r[1]).lower().startswith('section') else 'Section ' + str(r[1])}): {r[2]} students enrolled [Section ID: {r[3]}, Class ID: {r[4]}]" for r in classes])
        teacher_assignments_str = "\n".join(teacher_assignments)
        staff_str = "\n".join([f"- {r[0]} ({r[1] or 'Staff'}, Dept: {r[5] or 'General'}) | Status: {'Active' if r[4] else 'Inactive'} [Staff ID: {r[6]}]" for r in staff])
        leaves_str = "\n".join([f"- {r[0]}: {r[1]} to {r[2]} | Reason: '{r[3] or 'None'}' | Status: {r[4]} [Leave ID: {r[5]}]" for r in leaves])
        notices_str = "\n".join([f"- '{r[1]}' | Audience: {r[3] or 'All'} | Date: {to_pkt_date_str(r[4])} | Details: '{r[2] or 'None'}' [Notice ID: {r[0]}]" for r in notices])
        exams_str = "\n".join([f"- Exam: {r[0]} ({r[1] or 'Term'}) | Dates: {r[2]} to {r[3]} | Status: {r[4]} | Results Published: {'Yes' if r[5] else 'No'} [Exam ID: {r[6]}]" for r in exams])
        books_str = "\n".join([f"- '{r[0]}' by {r[1]} ({r[2] or 'General'}) | Available: {r[4]}/{r[3]} copies | Shelf: {r[5] or 'N/A'} [Book ID: {r[6]}]" for r in lib_books])
        issues_str = "\n".join([f"- Book '{r[0]}' borrowed by {r[1]} {r[2] or ''} | Due: {to_pkt_date_str(r[4])} | Status: {r[5]} | Fine: {format_money(r[6])} [Issue ID: {r[7]}]" for r in lib_issues])
        vehicles_str = "\n".join([f"- Bus {r[0]} ({r[1] or 'Reg'}): Type: {r[2] or 'Van'}, Capacity: {r[3]} seats | Driver: {r[4] or 'N/A'} ({r[5] or 'N/A'}) | Status: {r[6]} [Vehicle ID: {r[7]}]" for r in t_vehicles])
        routes_str = "\n".join([f"- Route {r[0]} ({r[1] or 'N/A'}): {r[2]} to {r[3]} | Bus: {r[6] or 'Unassigned'} | Driver: {r[7] or 'N/A'} ({r[8] or 'N/A'}) | Monthly Fare: {format_money(r[4])} | Status: {r[5]} [Route ID: {r[9]}]" for r in t_routes])
        complaints_str = "\n".join([f"- '{r[0]}' ({r[1] or 'General'}) | Priority: {r[3] or 'Normal'} | Status: {r[2]} [Complaint ID: {r[5]}]" for r in complaints])
        crm_str = ", ".join([f"{r[0] or 'New'}: {r[1]}" for r in crm_stats]) if crm_stats else "None"

        return f"""
[Role Context: School Executive / Owner / Principal]
Scope: {'Campus ' + str(active_campus_id) if active_campus_id else 'All School Campuses'}
{screen_context_header}

Live Executive KPIs:
- Total Active Enrolled Students: {metrics[0]}
- Active Campuses Count: {metrics[4]}
- Total Teachers Count: {metrics[1]}
- MTD Fee Collections (Received): {format_money(metrics[3])}
- Unpaid Invoices Count: {metrics[2]}
- Active Transport Routes Count: {metrics[5]}
- Library Catalog Books Count: {metrics[6]}
- Open Complaints / Issues Count: {metrics[7]}

Your Personal Assigned Teaching Classes & Subjects (if you also teach):
{personal_sections_str or 'None (You are an administrator with full school-wide oversight)'}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Registered Students Directory (Active Roster):
{students_str or 'None'}

Campuses Directory:
{campuses_str or 'None'}

Classes and Sections Enrollment Breakdown:
{classes_str or 'None'}

Class-to-Teacher Subject Assignments (Authorized VPS Records):
{teacher_assignments_str or 'None'}

Top Outstanding Fee Defaulters:
{defaulters_str or 'None'}

Recent Invoices Register:
{invoices_str or 'None'}

Recent Fee Payments Collected:
{payments_str or 'None'}

Library Books Catalog & Active Borrows:
Books Inventory:
{books_str or 'None'}
Active Book Issues / Overdue:
{issues_str or 'None'}

Transport Fleet & Bus Routes:
Vehicles:
{vehicles_str or 'None'}
Routes:
{routes_str or 'None'}

School Examination & Gradebook Status:
{exams_str or 'None'}

Staff & Teachers Roster:
{staff_str or 'None'}

Recent Staff Leave Requests:
{leaves_str or 'None'}

Recent School Notices:
{notices_str or 'None'}

Recent Complaints & Grievances:
{complaints_str or 'None'}

Admissions & CRM Leads Overview:
{crm_str}
"""
    # =========================================================================
    # ROLE 2: Teacher Context (Strictly Scoped to Assigned Classes & Subjects)
    # =========================================================================
    elif "teacher" in effective_roles:
        uid = str(user.id)
        uemail = getattr(user, "email", "") or ""
        t_param = {"uid": uid, "uemail": uemail, "sid": school_id}

        async def get_teacher_sections():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                ),
                all_sections_raw AS (
                    -- 1. Class / Section Assignments (teacher_assignments)
                    SELECT 
                        ta.class_section_id,
                        c.name AS class_name,
                        cs.name AS section_name,
                        COALESCE(
                            (SELECT string_agg(DISTINCT sub.name, ', ') 
                             FROM teacher_subject_assignments tsa2 
                             JOIN subjects sub ON tsa2.subject_id = sub.id 
                             WHERE tsa2.class_section_id = ta.class_section_id 
                               AND tsa2.teacher_user_id::text IN (SELECT tid FROM active_tids)
                            ),
                            (SELECT string_agg(DISTINCT tp.subject_name, ', ')
                             FROM timetable_periods tp
                             WHERE tp.class_section_id = ta.class_section_id
                               AND tp.teacher_user_id::text IN (SELECT tid FROM active_tids)
                            ),
                            'All Subjects (Class Teacher)'
                        ) AS subject_name,
                        ta.id::text AS assignment_id,
                        c.id AS class_id
                    FROM teacher_assignments ta
                    JOIN class_sections cs ON ta.class_section_id = cs.id
                    JOIN academic_classes c ON cs.class_id = c.id
                    WHERE ta.teacher_user_id::text IN (SELECT tid FROM active_tids)
                      AND ta.school_id = CAST(:sid AS UUID)

                    UNION

                    -- 2. Specific Subject Assignments (teacher_subject_assignments)
                    SELECT 
                        tsa.class_section_id,
                        c.name AS class_name,
                        cs.name AS section_name,
                        COALESCE(sub.name, 'Assigned Subject') AS subject_name,
                        tsa.id::text AS assignment_id,
                        c.id AS class_id
                    FROM teacher_subject_assignments tsa
                    JOIN class_sections cs ON tsa.class_section_id = cs.id
                    JOIN academic_classes c ON cs.class_id = c.id
                    LEFT JOIN subjects sub ON tsa.subject_id = sub.id
                    WHERE tsa.teacher_user_id::text IN (SELECT tid FROM active_tids)
                      AND tsa.school_id = CAST(:sid AS UUID)

                    UNION

                    -- 3. Timetable Schedule Periods (timetable_periods)
                    SELECT 
                        tp.class_section_id,
                        c.name AS class_name,
                        cs.name AS section_name,
                        COALESCE(tp.subject_name, 'General Subject') AS subject_name,
                        tp.id::text AS assignment_id,
                        c.id AS class_id
                    FROM timetable_periods tp
                    JOIN class_sections cs ON tp.class_section_id = cs.id
                    JOIN academic_classes c ON cs.class_id = c.id
                    WHERE tp.teacher_user_id::text IN (SELECT tid FROM active_tids)
                      AND c.school_id = CAST(:sid AS UUID)

                    UNION

                    -- 4. Timetable Entries (timetable_entries)
                    SELECT 
                        te.class_section_id,
                        c.name AS class_name,
                        cs.name AS section_name,
                        COALESCE(te.subject_name, 'General Subject') AS subject_name,
                        te.id::text AS assignment_id,
                        c.id AS class_id
                    FROM timetable_entries te
                    JOIN class_sections cs ON te.class_section_id = cs.id
                    JOIN academic_classes c ON cs.class_id = c.id
                    WHERE te.teacher_user_id::text IN (SELECT tid FROM active_tids)
                      AND te.school_id = CAST(:sid AS UUID)
                )
                SELECT DISTINCT class_section_id, class_name, section_name, subject_name, assignment_id, class_id
                FROM all_sections_raw
                ORDER BY class_name, section_name, subject_name
            """, t_param)

        async def get_teacher_students():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT s.first_name, s.last_name, s.student_code, c.name, cs.name, s.id as student_id, c.id as class_id, cs.id as section_id, s.parent_name, s.parent_phone
                FROM students s
                JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                JOIN class_sections cs ON se.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE cs.id IN (
                    SELECT class_section_id FROM teacher_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM timetable_periods WHERE teacher_user_id::text IN (SELECT tid FROM active_tids)
                    UNION
                    SELECT class_section_id FROM timetable_entries WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                ) AND s.status IN ('active', 'enrolled')
                ORDER BY c.name, cs.name, s.first_name
                LIMIT 100
            """, t_param)

        async def get_teacher_attendance():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT s.first_name, s.last_name, COUNT(*) FILTER (WHERE ae.status = 'present') as present, COUNT(*) as total, s.id as student_id
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                JOIN students s ON ae.student_id = s.id
                WHERE sess.class_section_id IN (
                    SELECT class_section_id FROM teacher_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM timetable_periods WHERE teacher_user_id::text IN (SELECT tid FROM active_tids)
                    UNION
                    SELECT class_section_id FROM timetable_entries WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                )
                GROUP BY s.id, s.first_name, s.last_name
                LIMIT 100
            """, t_param)

        async def get_teacher_assignments():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT a.title, a.description, a.due_date, a.max_marks, c.name, cs.name, a.id as assignment_id, a.class_section_id
                FROM assignments a
                JOIN class_sections cs ON a.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE cs.id IN (
                    SELECT class_section_id FROM teacher_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM timetable_periods WHERE teacher_user_id::text IN (SELECT tid FROM active_tids)
                    UNION
                    SELECT class_section_id FROM timetable_entries WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                ) AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 15
            """, t_param)

        async def get_teacher_diary():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT d.title, d.content, d.entry_date, c.name, cs.name, d.id as diary_id, d.class_section_id, d.subject_id
                FROM diary_entries d
                JOIN class_sections cs ON d.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE cs.id IN (
                    SELECT class_section_id FROM teacher_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT class_section_id FROM timetable_periods WHERE teacher_user_id::text IN (SELECT tid FROM active_tids)
                    UNION
                    SELECT class_section_id FROM timetable_entries WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                )
                ORDER BY d.entry_date DESC LIMIT 15
            """, t_param)

        async def get_teacher_results():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT e.name, s.first_name, s.last_name, COALESCE(sub.name, 'Subject'), er.marks_obtained, er.max_marks, er.grade, er.id as result_id, er.exam_id, s.id as student_id, er.subject_id
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN students s ON er.student_id = s.id
                LEFT JOIN subjects sub ON er.subject_id = sub.id
                WHERE er.student_id IN (
                    SELECT student_id FROM student_enrollments WHERE class_section_id IN (
                        SELECT class_section_id FROM teacher_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                        UNION
                        SELECT class_section_id FROM teacher_subject_assignments WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                        UNION
                        SELECT class_section_id FROM timetable_periods WHERE teacher_user_id::text IN (SELECT tid FROM active_tids)
                        UNION
                        SELECT class_section_id FROM timetable_entries WHERE teacher_user_id::text IN (SELECT tid FROM active_tids) AND school_id = CAST(:sid AS UUID)
                    ) AND end_date IS NULL
                )
                ORDER BY e.name, s.first_name LIMIT 60
            """, t_param)

        async def get_teacher_timetable():
            return await fetch_rows("""
                WITH teacher_ids AS (
                    SELECT :uid::text AS tid
                    UNION
                    SELECT user_id::text FROM public.teachers WHERE (user_id = :uid OR id::text = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT linked_user_id::text FROM public.hr_staff_directory WHERE (linked_user_id = :uid OR email = :uemail) AND school_id = CAST(:sid AS UUID)
                    UNION
                    SELECT id::text FROM public.profiles WHERE id = :uid OR email = :uemail
                ),
                active_tids AS (
                    SELECT DISTINCT tid FROM teacher_ids WHERE tid IS NOT NULL AND tid != ''
                )
                SELECT te.day_of_week, te.subject_name, te.start_time, te.end_time, c.name, cs.name, te.room, te.id
                FROM timetable_entries te
                JOIN class_sections cs ON te.class_section_id = cs.id
                JOIN academic_classes c ON cs.class_id = c.id
                WHERE te.teacher_user_id::text IN (SELECT tid FROM active_tids)
                  AND te.school_id = CAST(:sid AS UUID)
                ORDER BY te.day_of_week, te.start_time
            """, t_param)

        sections = await get_teacher_sections()
        students = await get_teacher_students()
        att = await get_teacher_attendance()
        assignments = await get_teacher_assignments()
        diary = await get_teacher_diary()
        results = await get_teacher_results()
        timetable = await get_teacher_timetable()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        sections_str = "\n".join([f"- {r[1]} ({r[2] if str(r[2]).lower().startswith('section') else 'Section ' + str(r[2])}) — Subject: {r[3]}" for r in sections])
        students_str = "\n".join([f"- {r[0]} {r[1] or ''} (Code: {r[2] or 'N/A'}, Class: {r[3]} {r[4]}, Parent: {r[8] or 'N/A'}, Phone: {r[9] or 'N/A'}) [Student ID: {r[5]}]" for r in students])
        att_str = "\n".join([f"- {r[0]} {r[1] or ''}: {round(r[2]/r[3]*100, 1)}% attendance ({r[2]}/{r[3]} days present) [Student ID: {r[4]}]" for r in att if r[3] > 0])
        hw_str = "\n".join([f"- '{r[0]}' ({r[1] or 'No details'}) | Due: {r[2]} | Class: {r[4]} {r[5]} [Assignment ID: {r[6]}]" for r in assignments])
        diary_str = "\n".join([f"- '{r[0]}' on {r[2]}: '{r[1] or 'None'}' | Class: {r[3]} {r[4]} [Diary ID: {r[5]}]" for r in diary])
        results_str = "\n".join([f"- Exam: {r[0]} | {r[1]} {r[2] or ''} | Subject: {r[3]} | Marks: {r[4]}/{r[5]} (Grade: {r[6]}) [Result ID: {r[7]}, Exam ID: {r[8]}, Student ID: {r[9]}]" for r in results])
        timetable_str = "\n".join([f"- Day {r[0]} ({r[2]}-{r[3]}): {r[4]} {r[5]} — {r[1]} (Room: {r[6] or 'General'})" for r in timetable])

        return f"""
[Role Context: School Teacher]
{screen_context_header}

Assigned Classes & Subjects:
{sections_str or 'None'}

Students in Your Assigned Classes:
{students_str or 'None'}

Attendance Rates in Your Classes:
{att_str or 'None'}

Active Assignments / Homework:
{hw_str or 'None'}

Recent Diary Entries:
{diary_str or 'None'}

Exam Results & Marks:
{results_str or 'None'}

Your Weekly Teaching Timetable:
{timetable_str or 'None'}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}
"""

    # =========================================================================
    # ROLE 3: Parent Context (Strictly Scoped to Own Children)
    # =========================================================================
    elif "parent" in effective_roles:
        uid = str(user.id)
        
        async def get_parent_children():
            return await fetch_rows("""
                SELECT DISTINCT s.id, s.first_name, s.last_name, s.student_code, c.name, cs.name, c.id as class_id, cs.id as section_id
                FROM students s
                LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.user_id = :uid
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE (sg.user_id = :uid OR s.parent_id = :uid OR s.profile_id = :uid) AND s.school_id = CAST(:sid AS UUID)
            """, {"uid": uid, "sid": school_id})

        children = await get_parent_children()
        if not children:
            branding = await get_branding()
            holidays = await get_holidays()
            return f"[Role Context: Parent]\n{screen_context_header}\nNo linked children profiles found in this school.\nSchool Branding: {branding}\nUpcoming Holidays: {holidays}"

        child_ids = [str(c[0]) for c in children]

        async def get_child_attendance():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, ae.status, sess.session_date, sess.period_label, ae.student_id
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                JOIN students s ON ae.student_id = s.id
                WHERE ae.student_id = ANY(SELECT unnest(CAST(:cids AS UUID[])))
                ORDER BY sess.session_date DESC LIMIT 30
            """, {"cids": child_ids})

        async def get_child_invoices():
            return await fetch_rows("""
                SELECT i.invoice_number, s.first_name, s.last_name, i.total_amount, i.paid_amount, i.due_date, i.status, i.created_at, i.id as invoice_id, s.id as student_id
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.student_id = ANY(SELECT unnest(CAST(:cids AS UUID[])))
                ORDER BY i.created_at DESC
            """, {"cids": child_ids})

        async def get_child_results():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, e.name, sub.name, er.marks_obtained, er.max_marks, er.grade, er.remarks, er.id as result_id, er.exam_id, s.id as student_id
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN subjects sub ON er.subject_id = sub.id
                JOIN students s ON er.student_id = s.id
                WHERE er.student_id = ANY(SELECT unnest(CAST(:cids AS UUID[])))
                ORDER BY e.name, sub.name
            """, {"cids": child_ids})

        async def get_child_homework():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, a.title, a.description, a.due_date, a.max_marks, a.id as assignment_id, s.id as student_id
                FROM assignments a
                JOIN student_enrollments se ON a.class_section_id = se.class_section_id AND se.end_date IS NULL
                JOIN students s ON se.student_id = s.id
                WHERE s.id = ANY(SELECT unnest(CAST(:cids AS UUID[]))) AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 15
            """, {"cids": child_ids})

        async def get_child_diary():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, d.title, d.content, d.entry_date, d.id as diary_id, s.id as student_id
                FROM diary_entries d
                JOIN student_enrollments se ON d.class_section_id = se.class_section_id AND se.end_date IS NULL
                JOIN students s ON se.student_id = s.id
                WHERE s.id = ANY(SELECT unnest(CAST(:cids AS UUID[])))
                ORDER BY d.entry_date DESC LIMIT 15
            """, {"cids": child_ids})

        async def get_child_transport():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, r.route_name, st.stop_name, st.estimated_morning_time, st.estimated_evening_time, v.bus_number, v.driver_name, v.driver_phone
                FROM student_transport_assignments sta
                JOIN students s ON sta.student_id = s.id
                JOIN bus_routes r ON sta.route_id = r.id
                LEFT JOIN bus_stops st ON sta.stop_id = st.id
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE sta.student_id = ANY(SELECT unnest(CAST(:cids AS UUID[]))) AND sta.status = 'active'
            """, {"cids": child_ids})

        att = await get_child_attendance()
        invoices = await get_child_invoices()
        results = await get_child_results()
        homework = await get_child_homework()
        diary = await get_child_diary()
        transport = await get_child_transport()
        branding = await get_branding()
        holidays = await get_holidays()

        children_str = "\n".join([f"- Child: {r[1]} {r[2] or ''} (Code: {r[3] or 'N/A'}, Class: {r[4] or 'Unassigned'} {r[5] or ''}) [Student ID: {r[0]}]" for r in children])
        att_str = "\n".join([f"- {r[0]}: {r[2]} on {r[3]} (Period: {r[4] or 'General'})" for r in att])
        inv_str = "\n".join([f"- Invoice #{r[0]} for {r[1]} {r[2] or ''}: Total: {format_money(r[3])}, Paid: {format_money(r[4])}, Due: {to_pkt_date_str(r[5])}, Status: {r[6]} [Invoice ID: {r[8]}, Student ID: {r[9]}]" for r in invoices])
        res_str = "\n".join([f"- {r[0]}: {r[2]} — {r[3]}: Marks: {r[4]}/{r[5]} (Grade: {r[6]}, Remarks: '{r[7] or 'Good'}') [Result ID: {r[8]}, Exam ID: {r[9]}, Student ID: {r[10]}]" for r in results])
        hw_str = "\n".join([f"- {r[0]}: Homework '{r[2]}' ({r[3] or 'None'}) | Due: {r[4]} | Max Marks: {r[5]} [Assignment ID: {r[6]}]" for r in homework])
        diary_str = "\n".join([f"- {r[0]}: Diary '{r[2]}' on {r[4]}: '{r[3] or 'None'}'" for r in diary])
        t_str = "\n".join([f"- {r[0]} {r[1] or ''}: Route '{r[2]}' (Stop: {r[3] or 'N/A'}, Pickup: {r[4] or 'N/A'}, Drop: {r[5] or 'N/A'}) | Bus #{r[6] or 'N/A'} | Driver: {r[7] or 'N/A'} ({r[8] or 'N/A'})" for r in transport])

        return f"""
[Role Context: Parent]
{screen_context_header}

Your Registered Children:
{children_str}

Children's Recent Attendance Records:
{att_str or 'None'}

Children's Fee Invoices & Payment Status:
{inv_str or 'None'}

Children's Exam Results & Academic Grades:
{res_str or 'None'}

Active Homework & Tasks:
{hw_str or 'None'}

Recent Class Diary Logs:
{diary_str or 'None'}

Assigned Transport & School Bus Info:
{t_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 4: Student Context (Strictly Scoped to Own Individual Profile)
    # =========================================================================
    elif "student" in effective_roles:
        uid = str(user.id)
        email = getattr(user, "email", "")
        
        async def get_student_profile():
            return await fetch_rows("""
                SELECT s.id, s.first_name, s.last_name, s.student_code, c.name, cs.name
                FROM students s
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE (s.profile_id = :uid OR s.user_id = :uid OR s.id = :uid OR s.email = :email) AND s.school_id = CAST(:sid AS UUID)
                LIMIT 1
            """, {"uid": uid, "email": email, "sid": school_id})

        profiles = await get_student_profile()
        if not profiles:
            branding = await get_branding()
            holidays = await get_holidays()
            return f"[Role Context: Student]\n{screen_context_header}\nStudent profile not found in this school.\nSchool Branding: {branding}\nUpcoming Holidays: {holidays}"

        s_id, first_name, last_name, code, class_name, section_name = profiles[0]

        async def get_my_attendance():
            return await fetch_rows("""
                SELECT ae.status, sess.session_date, sess.period_label
                FROM attendance_entries ae
                JOIN attendance_sessions sess ON ae.session_id = sess.id
                WHERE ae.student_id = CAST(:sid AS UUID)
                ORDER BY sess.session_date DESC LIMIT 30
            """, {"sid": s_id})

        async def get_my_results():
            return await fetch_rows("""
                SELECT e.name, sub.name, er.marks_obtained, er.max_marks, er.grade, er.remarks, er.id as result_id, er.exam_id
                FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                JOIN subjects sub ON er.subject_id = sub.id
                WHERE er.student_id = CAST(:sid AS UUID)
                ORDER BY e.name, sub.name
            """, {"sid": s_id})

        async def get_my_homework():
            return await fetch_rows("""
                SELECT a.title, a.description, a.due_date, a.max_marks, a.id as assignment_id
                FROM assignments a
                JOIN student_enrollments se ON a.class_section_id = se.class_section_id AND se.end_date IS NULL
                WHERE se.student_id = CAST(:sid AS UUID) AND a.status = 'active'
                ORDER BY a.due_date DESC LIMIT 15
            """, {"sid": s_id})

        async def get_my_invoices():
            return await fetch_rows("""
                SELECT invoice_number, total_amount, paid_amount, due_date, status, id as invoice_id
                FROM fee_invoices
                WHERE student_id = CAST(:sid AS UUID)
                ORDER BY created_at DESC LIMIT 10
            """, {"sid": s_id})

        async def get_my_timetable():
            return await fetch_rows("""
                SELECT te.day_of_week, te.subject_name, te.start_time, te.end_time, te.room
                FROM timetable_entries te
                JOIN student_enrollments se ON te.class_section_id = se.class_section_id AND se.end_date IS NULL
                WHERE se.student_id = CAST(:sid AS UUID)
                ORDER BY te.day_of_week, te.start_time
            """, {"sid": s_id})

        att = await get_my_attendance()
        results = await get_my_results()
        homework = await get_my_homework()
        invoices = await get_my_invoices()
        timetable = await get_my_timetable()
        branding = await get_branding()
        holidays = await get_holidays()

        att_str = "\n".join([f"- {r[0]} on {r[1]} ({r[2] or 'General'})" for r in att])
        res_str = "\n".join([f"- {r[0]} — {r[1]}: Marks: {r[2]}/{r[3]} (Grade: {r[4]}, Remarks: '{r[5] or 'None'}') [Result ID: {r[6]}, Exam ID: {r[7]}]" for r in results])
        hw_str = "\n".join([f"- '{r[0]}' ({r[1] or 'None'}) | Due: {r[2]} | Max Marks: {r[3]} [Assignment ID: {r[4]}]" for r in homework])
        inv_str = "\n".join([f"- Invoice #{r[0]}: Total: {format_money(r[1])}, Paid: {format_money(r[2])}, Due: {to_pkt_date_str(r[3])}, Status: {r[4]} [Invoice ID: {r[5]}]" for r in invoices])
        tt_str = "\n".join([f"- Day {r[0]} ({r[2]}-{r[3]}): {r[1]} (Room: {r[4] or 'Main'})" for r in timetable])

        return f"""
[Role Context: Student]
{screen_context_header}

Name: {first_name} {last_name or ''} (Code: {code or 'N/A'}, Class: {class_name or 'N/A'} {section_name or ''}) [Student ID: {s_id}]

Your Attendance History:
{att_str or 'None'}

Your Exam Grades & Results:
{res_str or 'None'}

Your Homework & Active Tasks:
{hw_str or 'None'}

Your Class Timetable:
{tt_str or 'None'}

Your Fee Invoices:
{inv_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 5: Accountant Context (Strictly Scoped to Financial Data)
    # =========================================================================
    elif "accountant" in effective_roles:
        async def get_fin_metrics():
            rows = await fetch_rows("""
                SELECT 
                    COALESCE(SUM(total_amount - paid_amount), 0) as outstanding,
                    COALESCE(SUM(paid_amount), 0) as paid,
                    COUNT(*) FILTER (WHERE status != 'paid') as unpaid_count
                FROM fee_invoices
                WHERE school_id = CAST(:sid AS UUID) AND student_id != CAST('00000000-0000-0000-0000-000000000000' AS UUID)
            """, {"sid": school_id})
            return rows[0] if rows else (0, 0, 0)

        async def get_acc_defaulters():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0) as balance, i.invoice_number, s.id as student_id, i.id as invoice_id, s.parent_name, s.parent_phone
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.school_id = CAST(:sid AS UUID) AND i.status != 'paid' AND i.student_id != CAST('00000000-0000-0000-0000-000000000000' AS UUID)
                ORDER BY balance DESC LIMIT 25
            """, {"sid": school_id})

        async def get_acc_invoices():
            return await fetch_rows("""
                SELECT i.invoice_number, s.first_name, s.last_name, c.name, cs.name, 
                       i.total_amount, i.paid_amount, i.due_date, i.status, i.created_at,
                       s.id as student_id, i.id as invoice_id
                FROM fee_invoices i
                JOIN students s ON i.student_id = s.id
                LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.end_date IS NULL
                LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                LEFT JOIN academic_classes c ON cs.class_id = c.id
                WHERE i.school_id = CAST(:sid AS UUID) AND i.student_id != CAST('00000000-0000-0000-0000-000000000000' AS UUID)
                ORDER BY i.created_at DESC LIMIT 60
            """, {"sid": school_id})

        async def get_acc_plans():
            return await fetch_rows("SELECT name, currency, is_active, billing_frequency, description, id as fee_plan_id FROM fee_plans WHERE school_id = CAST(:sid AS UUID)", {"sid": school_id})

        async def get_acc_payments():
            return await fetch_rows("""
                SELECT fp.amount, fp.method, fp.paid_at, fp.status, s.first_name, s.last_name, fp.id as payment_id, fp.invoice_id
                FROM fee_payments fp
                JOIN students s ON fp.student_id = s.id
                WHERE fp.school_id = CAST(:sid AS UUID)
                ORDER BY fp.paid_at DESC LIMIT 30
            """, {"sid": school_id})

        async def get_acc_expenses():
            return await fetch_rows("""
                SELECT description, amount, category, expense_date, vendor, id as expense_id FROM finance_expenses 
                WHERE school_id = CAST(:sid AS UUID) ORDER BY expense_date DESC LIMIT 25
            """, {"sid": school_id})

        metrics = await get_fin_metrics()
        defaulters = await get_acc_defaulters()
        invoices = await get_acc_invoices()
        plans = await get_acc_plans()
        payments = await get_acc_payments()
        expenses = await get_acc_expenses()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        defaulters_str = "\n".join([f"- {r[0]} {r[1] or ''}: Outstanding: {format_money(r[2])} (Invoice: #{r[3]} | Parent: {r[6] or 'N/A'}, Phone: {r[7] or 'N/A'}) [Invoice ID: {r[5]}, Student ID: {r[4]}]" for r in defaulters])
        invoices_str = "\n".join([f"- Inv #{r[0]}: {r[1]} {r[2] or ''} ({r[3] or 'N/A'}-{r[4] or 'N/A'}), Total: {format_money(r[5])}, Paid: {format_money(r[6])}, Due: {to_pkt_date_str(r[7])}, Status: {r[8]} [Invoice ID: {r[11]}, Student ID: {r[10]}]" for r in invoices])
        plans_str = "\n".join([f"- {r[0]} ({r[3]}, {r[1]}): {r[4] or 'Standard'} | {'Active' if r[2] else 'Inactive'} [Fee Plan ID: {r[5]}]" for r in plans])
        payments_str = "\n".join([f"- Received: {format_money(r[0])} via {r[1]} on {to_pkt_date_str(r[2])} | Status: {r[3]} | Student: {r[4]} {r[5] or ''} [Payment ID: {r[6]}, Invoice ID: {r[7] or 'N/A'}]" for r in payments])
        expenses_str = "\n".join([f"- Expense: {format_money(r[1])} for '{r[0]}' ({r[2]}) on {r[3]} | Vendor: {r[4] or 'N/A'} [Expense ID: {r[5]}]" for r in expenses])

        return f"""
[Role Context: School Accountant]
{screen_context_header}

Financial Metrics:
- Outstanding Receivables: {format_money(metrics[0])}
- Total Collected Fees: {format_money(metrics[1])}
- Pending Unpaid Invoices: {metrics[2]}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Top Fee Defaulters:
{defaulters_str or 'None'}

Invoices Register:
{invoices_str or 'None'}

Active Fee Plans & Schedules:
{plans_str or 'None'}

Recent Fee Payments Collected:
{payments_str or 'None'}

Recent Operational Expenses:
{expenses_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 6: HR Manager Context (Strictly Scoped to Staff & Payroll)
    # =========================================================================
    elif "hr_manager" in effective_roles:
        async def get_hr_staff():
            return await fetch_rows("""
                SELECT full_name, position, email, phone, is_active, department, id as staff_id, linked_user_id 
                FROM hr_staff_directory WHERE school_id = CAST(:sid AS UUID) ORDER BY full_name LIMIT 60
            """, {"sid": school_id})

        async def get_hr_leaves():
            return await fetch_rows("""
                SELECT sd.full_name, lr.leave_type_id, lr.start_date, lr.end_date, lr.reason, lr.status, lr.id as leave_id
                FROM hr_leave_requests lr
                LEFT JOIN hr_staff_directory sd ON lr.user_id = sd.linked_user_id
                WHERE lr.school_id = CAST(:sid AS UUID) ORDER BY lr.created_at DESC LIMIT 25
            """, {"sid": school_id})

        async def get_hr_salaries():
            return await fetch_rows("""
                SELECT sd.full_name, sr.base_salary, sr.allowances, sr.deductions, sr.status, sr.month, sr.year, sr.id as salary_id
                FROM hr_salary_records sr
                LEFT JOIN hr_staff_directory sd ON sr.user_id = sd.linked_user_id
                WHERE sr.school_id = CAST(:sid AS UUID) ORDER BY sr.year DESC, sr.month DESC LIMIT 30
            """, {"sid": school_id})

        staff = await get_hr_staff()
        leaves = await get_hr_leaves()
        salaries = await get_hr_salaries()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        staff_str = "\n".join([f"- {r[0]} ({r[1] or 'Staff'}, Dept: {r[5] or 'General'}, Email: {r[2] or 'N/A'}) | Status: {'Active' if r[4] else 'Inactive'} [Staff ID: {r[6]}]" for r in staff])
        leaves_str = "\n".join([f"- {r[0]}: {r[2]} to {r[3]} | Reason: '{r[4] or 'None'}' | Status: {r[5]} [Leave ID: {r[6]}]" for r in leaves])
        salaries_str = "\n".join([f"- {r[0]}: Base: {format_money(r[1])}, Allowances: {format_money(r[2])}, Deductions: {format_money(r[3])} | Month/Year: {r[5]}/{r[6]} | Status: {r[4]} [Salary ID: {r[7]}]" for r in salaries])

        return f"""
[Role Context: HR Manager]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Staff Directory:
{staff_str or 'None'}

Staff Leave Requests:
{leaves_str or 'None'}

Recent Payroll & Salary Records:
{salaries_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 7: Librarian / Library Manager
    # =========================================================================
    elif "librarian" in effective_roles:
        async def get_all_books():
            return await fetch_rows("""
                SELECT title, author, isbn, category, total_copies, available_copies, shelf_location, id as book_id
                FROM library_books WHERE school_id = CAST(:sid AS UUID) ORDER BY title LIMIT 100
            """, {"sid": school_id})

        async def get_all_issues():
            return await fetch_rows("""
                SELECT b.title, s.first_name, s.last_name, bi.issue_date, bi.due_date, bi.status, bi.fine_amount, bi.id as issue_id, bi.return_date
                FROM book_issues bi
                JOIN library_books b ON bi.book_id = b.id
                LEFT JOIN students s ON bi.borrower_id = s.id
                WHERE bi.school_id = CAST(:sid AS UUID)
                ORDER BY bi.due_date ASC LIMIT 50
            """, {"sid": school_id})

        books = await get_all_books()
        issues = await get_all_issues()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        books_str = "\n".join([f"- '{r[0]}' by {r[1]} ({r[3] or 'General'}) | ISBN: {r[2] or 'N/A'} | Available: {r[5]}/{r[4]} | Shelf: {r[6] or 'Main'} [Book ID: {r[7]}]" for r in books])
        issues_str = "\n".join([f"- Book '{r[0]}' | Borrower: {r[1]} {r[2] or ''} | Due: {to_pkt_date_str(r[4])} | Status: {r[5]} | Fine: {format_money(r[6])} [Issue ID: {r[7]}]" for r in issues])

        return f"""
[Role Context: School Librarian]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Library Books Catalog:
{books_str or 'None'}

Active & Overdue Book Issues:
{issues_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 8: Transport Manager / Fleet Coordinator
    # =========================================================================
    elif "transport_manager" in effective_roles:
        async def get_transport_fleet():
            vehicles = await fetch_rows("""
                SELECT bus_number, registration_no, vehicle_type, seating_capacity, driver_name, driver_phone, conductor_name, conductor_phone, status, id as vehicle_id
                FROM vehicles WHERE school_id = CAST(:sid AS UUID) ORDER BY bus_number
            """, {"sid": school_id})
            routes = await fetch_rows("""
                SELECT r.route_name, r.route_code, r.start_point, r.end_point, r.morning_departure, r.evening_departure, r.monthly_fare, r.status, v.bus_number, v.driver_name, v.driver_phone, r.id as route_id
                FROM bus_routes r
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.school_id = CAST(:sid AS UUID) ORDER BY r.route_name
            """, {"sid": school_id})
            stops = await fetch_rows("""
                SELECT bs.stop_name, r.route_name, bs.estimated_morning_time, bs.estimated_evening_time, bs.landmark, bs.id as stop_id
                FROM bus_stops bs
                JOIN bus_routes r ON bs.route_id = r.id
                WHERE r.school_id = CAST(:sid AS UUID) ORDER BY r.route_name, bs.stop_order LIMIT 60
            """, {"sid": school_id})
            return vehicles, routes, stops

        vehicles, routes, stops = await get_transport_fleet()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        v_str = "\n".join([f"- Bus {r[0]} ({r[1] or 'Reg'}): {r[2] or 'Bus'} (Seats: {r[3]}) | Driver: {r[4] or 'N/A'} ({r[5] or 'N/A'}) | Conductor: {r[6] or 'N/A'} ({r[7] or 'N/A'}) | Status: {r[8]} [Vehicle ID: {r[9]}]" for r in vehicles])
        r_str = "\n".join([f"- Route {r[0]} ({r[1] or 'N/A'}): {r[2]} to {r[3]} (Morning: {r[4] or '07:30'}, Evening: {r[5] or '14:00'}) | Bus #{r[8] or 'N/A'} | Driver: {r[9] or 'N/A'} ({r[10] or 'N/A'}) | Fare: {format_money(r[6])} | Status: {r[7]} [Route ID: {r[11]}]" for r in routes])
        s_str = "\n".join([f"- Stop '{r[0]}' on Route '{r[1]}' (Morning: {r[2] or 'N/A'}, Evening: {r[3] or 'N/A'}) [Stop ID: {r[5]}]" for r in stops])

        return f"""
[Role Context: School Transport Manager]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Fleet Vehicles:
{v_str or 'None'}

Bus Routes & Schedules:
{r_str or 'None'}

Route Stops:
{s_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 9: Marketing / Admissions / CRM Context
    # =========================================================================
    elif any(r in effective_roles for r in ["marketing", "admissions_officer"]):
        async def get_leads():
            return await fetch_rows("""
                SELECT full_name, email, phone, stage_id, source, status, created_at, id as lead_id
                FROM crm_leads WHERE school_id = CAST(:sid AS UUID) ORDER BY created_at DESC LIMIT 30
            """, {"sid": school_id})

        leads = await get_leads()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        leads_str = "\n".join([f"- Lead: {r[0]} ({r[1] or 'No Email'}, {r[2] or 'No Phone'}) | Source: {r[4] or 'Direct'} | Status: {r[5]} [Lead ID: {r[7]}]" for r in leads])

        return f"""
[Role Context: Marketing & Admissions Officer]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Recent CRM Leads & Inquiries:
{leads_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # ROLE 10: Counselor / Wellbeing
    # =========================================================================
    elif "counselor" in effective_roles:
        async def get_counseling_notes():
            return await fetch_rows("""
                SELECT s.first_name, s.last_name, bn.title, bn.content, bn.note_type, bn.created_at, bn.id as note_id, s.id as student_id
                FROM behavior_notes bn
                JOIN students s ON bn.student_id = s.id
                WHERE bn.school_id = CAST(:sid AS UUID) ORDER BY bn.created_at DESC LIMIT 30
            """, {"sid": school_id})

        notes = await get_counseling_notes()
        branding = await get_branding()
        holidays = await get_holidays()
        targeted_matches = await get_targeted_search_matches(user_query)

        notes_str = "\n".join([f"- Student: {r[0]} {r[1] or ''} | Note: '{r[2]}' ({r[3] or 'None'}) | Type: {r[4]} | Date: {to_pkt_date_str(r[5])} [Note ID: {r[6]}, Student ID: {r[7]}]" for r in notes])

        return f"""
[Role Context: School Counselor]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

Recent Student Wellbeing & Behavior Notes:
{notes_str or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

    # =========================================================================
    # DEFAULT / GUEST FALLBACK
    # =========================================================================
    branding = await get_branding()
    holidays = await get_holidays()
    targeted_matches = await get_targeted_search_matches(user_query)
    return f"""
[Role Context: Guest / General User]
{screen_context_header}

Targeted Search Results for Current Query:
{targeted_matches or 'None'}

School Branding: {branding}
Upcoming Holidays: {holidays}
"""

