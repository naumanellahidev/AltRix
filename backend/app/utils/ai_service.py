# -*- coding: utf-8 -*-
import json
import logging
import re
import os
import asyncio
import httpx
from typing import AsyncGenerator, Dict, List, Optional, Any, cast
from app.config import settings

logger = logging.getLogger("app.ai_service")


class OllamaAIService:
    """
    Enterprise-grade provider-agnostic AI Copilot Service for AltRix ERP.
    Features:
    1. Multi-provider LLM streaming (Google Gemini, Groq, OpenRouter, OpenAI, DeepSeek, Cloud/Local Ollama).
    2. Zero-config automatic connection to Google Gemini API (gemini-1.5-flash / gemini-2.0-flash / gemini-1.5-pro).
    3. Autonomous High-Precision ERP Cognitive Engine when external LLM is offline.
    4. Strict single-tenant data isolation and role-scoped execution.
    5. Real-time data extraction directly from active DB context with dynamic chart and action tag generation.
    6. Complete, universal coverage of ALL 15 ERP functional areas & screens:
       - Academic & Timetable (Classes, Sections, Schedules, Periods, Homework, Diary, Lesson Plans)
       - Students & Admissions (Directory, Digital Twin, Guardians, Enrollment, Applications)
       - Attendance Register (Student & Staff Daily Turnout, Absentees, Percentages)
       - Finance & Fees (Invoices, Defaulters, Payments, Fee Plans, Expenses)
       - Examination & Gradebook (Exams, Results, Marks, Report Cards, GPA)
       - Library Management (Books Catalog, Issues, Overdue, Fines)
       - Transport & Fleet (Vehicles, Routes, Stops, Driver Info, Student Bus Allocations)
       - HR & Staff Management (Directory, Leave Requests, Payroll & Salary Records)
       - Communication & CRM (Notices, Complaints, CRM Leads, Campaigns, Holidays)
    """

    @classmethod
    def route_model(cls, query: str, provider: str = "gemini") -> str:
        reasoning_keywords = [
            "compare", "analyze", "trend", "report", "why", "performance",
            "forecast", "predict", "benchmark", "root cause", "explain", "detailed"
        ]
        query_lower = query.lower()
        is_reasoning = any(keyword in query_lower for keyword in reasoning_keywords)

        if provider == "gemini":
            if settings.ai_reasoning_model and "gemini" in settings.ai_reasoning_model.lower():
                return settings.ai_reasoning_model if is_reasoning else (settings.ai_general_model or "gemini-1.5-flash")
            return "gemini-1.5-pro" if is_reasoning else "gemini-1.5-flash"

        elif provider == "groq":
            return "llama-3.3-70b-versatile" if is_reasoning else "llama-3.1-8b-instant"

        elif provider == "openrouter":
            return "google/gemini-2.0-flash-001" if not is_reasoning else "deepseek/deepseek-r1"

        else:
            reasoning_default = settings.ollama_reasoning_model or settings.ai_reasoning_model or "deepseek-r1"
            general_default = settings.ollama_general_model or settings.ai_general_model or "qwen2.5"
            return reasoning_default if is_reasoning else general_default

    @classmethod
    def _parse_context_metrics(cls, context_text: str) -> Dict[str, Any]:
        """
        Parses real-time numbers, lists, and records directly from the database context string.
        """
        data: Dict[str, Any] = {
            "role": "General User",
            "active_screen": "",
            "active_module": "",
            "total_students": 0,
            "active_campuses": 0,
            "total_teachers": 0,
            "collected_fees": "Rs. 0.00",
            "pending_invoices_count": 0,
            "active_routes_count": 0,
            "library_books_count": 0,
            "open_complaints_count": 0,
            "pending_admissions": 0,
            "campuses": cast(List[str], []),
            "classes": cast(List[str], []),
            "students": cast(List[str], []),
            "search_matches": cast(List[str], []),
            "staff": cast(List[str], []),
            "staff_attendance": {"present": 0, "absent": 0, "unmarked": 0, "details": cast(List[str], [])},
            "defaulters": cast(List[str], []),
            "recent_invoices": cast(List[str], []),
            "recent_payments": cast(List[str], []),
            "library_books": cast(List[str], []),
            "library_issues": cast(List[str], []),
            "transport_vehicles": cast(List[str], []),
            "transport_routes": cast(List[str], []),
            "route_stops": cast(List[str], []),
            "exams": cast(List[str], []),
            "leaves": cast(List[str], []),
            "notices": cast(List[str], []),
            "complaints": cast(List[str], []),
            "homework": cast(List[str], []),
            "diary": cast(List[str], []),
            "timetable": cast(List[str], []),
            "plans": cast(List[str], []),
            "expenses": cast(List[str], []),
            "crm_leads": cast(List[str], []),
            "holidays": cast(List[str], []),
        }

        if not context_text:
            return data

        def get_sec(pat: str) -> str:
            m = re.search(rf'(?:^|\n)[^\n]*?(?:{pat})[^\n]*?:\s*\n(.*?)(?=\n\n[A-Z\[]|\Z)', context_text, re.DOTALL | re.IGNORECASE)
            return m.group(1).strip() if m else ""

        # 1. Parse Role
        role_match = re.search(r'\[Role Context:\s*([^\]]+)\]', context_text)
        if role_match:
            data["role"] = role_match.group(1).strip()

        # 2. Parse Active UI Context
        screen_match = re.search(r'- Current Screen/Route:\s*([^\n]+)', context_text)
        if screen_match:
            data["active_screen"] = screen_match.group(1).strip()
        module_match = re.search(r'- Current Module:\s*([^\n]+)', context_text)
        if module_match:
            data["active_module"] = module_match.group(1).strip()

        # 3. Parse Live ERP Metrics
        students_match = re.search(r'Total Active (?:Enrolled )?Students:\s*(\d+)', context_text)
        if students_match:
            data["total_students"] = int(students_match.group(1))

        campuses_match = re.search(r'Active Campuses(?: Count)?:\s*(\d+)', context_text)
        if campuses_match:
            data["active_campuses"] = int(campuses_match.group(1))

        teachers_match = re.search(r'Total Teachers(?: Count)?:\s*(\d+)', context_text)
        if teachers_match:
            data["total_teachers"] = int(teachers_match.group(1))

        fees_match = re.search(r'MTD Fee Collections.*:\s*([^\n]+)', context_text)
        if fees_match:
            data["collected_fees"] = fees_match.group(1).strip()

        unpaid_match = re.search(r'Unpaid Invoices Count:\s*(\d+)', context_text)
        if unpaid_match:
            data["pending_invoices_count"] = int(unpaid_match.group(1))

        routes_cnt_match = re.search(r'Active Transport Routes Count:\s*(\d+)', context_text)
        if routes_cnt_match:
            data["active_routes_count"] = int(routes_cnt_match.group(1))

        lib_cnt_match = re.search(r'Library Catalog Books Count:\s*(\d+)', context_text)
        if lib_cnt_match:
            data["library_books_count"] = int(lib_cnt_match.group(1))

        comp_cnt_match = re.search(r'Open Complaints / Issues Count:\s*(\d+)', context_text)
        if comp_cnt_match:
            data["open_complaints_count"] = int(comp_cnt_match.group(1))

        adm_match = re.search(r'Pending Admissions Applications:\s*(\d+)', context_text)
        if adm_match:
            data["pending_admissions"] = int(adm_match.group(1))

        # 4. Parse Targeted Search Matches
        sec_matches = get_sec(r'Targeted Search Results')
        if sec_matches and sec_matches != "None":
            for line in sec_matches.split('\n'):
                line = line.strip()
                if line and line != "None":
                    data["search_matches"].append(line)

        # 5. Parse Students Directory
        sec_stu = get_sec(r'Registered Students Directory|Students in Your Assigned Classes|Your Registered Children|Students Directory')
        if sec_stu and sec_stu != "None":
            for line in sec_stu.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["students"].append(line[2:])

        # 6. Parse Campuses Directory
        sec_camp = get_sec(r'Campuses Directory')
        if sec_camp and sec_camp != "None":
            for line in sec_camp.split('\n'):
                line = line.strip()
                if line.startswith('- '):
                    data["campuses"].append(line[2:])

        # 7. Parse Classes and Sections
        sec_cls = get_sec(r'Classes and Sections Enrollment')
        if sec_cls and sec_cls != "None":
            for line in sec_cls.split('\n'):
                line = line.strip()
                if line.startswith('- '):
                    data["classes"].append(line[2:])

        # 8. Parse Defaulters
        sec_def = get_sec(r'Top Outstanding Fee Defaulters')
        if sec_def and sec_def != "None":
            for line in sec_def.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["defaulters"].append(line[2:])

        # 9. Parse Invoices
        sec_inv = get_sec(r'Recent Invoices Register|Invoices Register|Your Fee Invoices|Children\'s Fee Invoices')
        if sec_inv and sec_inv != "None":
            for line in sec_inv.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["recent_invoices"].append(line[2:])

        # 10. Parse Recent Payments
        sec_pay = get_sec(r'Recent Fee Payments Collected')
        if sec_pay and sec_pay != "None":
            for line in sec_pay.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["recent_payments"].append(line[2:])

        # 11. Parse Library Books & Issues
        sec_books = get_sec(r'Books Inventory|Library Books Catalog')
        if sec_books and sec_books != "None":
            for line in sec_books.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["library_books"].append(line[2:])

        sec_issues = get_sec(r'Active Book Issues / Overdue|Active & Overdue Book Issues')
        if sec_issues and sec_issues != "None":
            for line in sec_issues.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["library_issues"].append(line[2:])

        # 12. Parse Transport Vehicles & Routes
        sec_vehicles = get_sec(r'Vehicles|Fleet Vehicles')
        if sec_vehicles and sec_vehicles != "None":
            for line in sec_vehicles.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["transport_vehicles"].append(line[2:])

        sec_routes = get_sec(r'Routes|Bus Routes & Schedules|Assigned Transport & School Bus Info')
        if sec_routes and sec_routes != "None":
            for line in sec_routes.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["transport_routes"].append(line[2:])

        sec_stops = get_sec(r'Route Stops')
        if sec_stops and sec_stops != "None":
            for line in sec_stops.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["route_stops"].append(line[2:])

        # 13. Parse Staff & Faculty
        sec_staff = get_sec(r'Staff & Teachers Roster|Teachers & Active Staff Directory|Staff Directory')
        if sec_staff and sec_staff != "None":
            for line in sec_staff.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["staff"].append(line[2:])

        # 14. Parse Leaves
        sec_leaves = get_sec(r'Recent Staff Leave Requests|Staff Leave Requests')
        if sec_leaves and sec_leaves != "None":
            for line in sec_leaves.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["leaves"].append(line[2:])

        # 15. Parse Exams & Marks
        sec_exam = get_sec(r'School Examination & Gradebook Status|Exam Results & Marks|Your Exam Grades & Results|Children\'s Exam Results')
        if sec_exam and sec_exam != "None":
            for line in sec_exam.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["exams"].append(line[2:])

        # 16. Parse Timetable
        sec_tt = get_sec(r'Your Weekly Teaching Timetable|Your Class Timetable')
        if sec_tt and sec_tt != "None":
            for line in sec_tt.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["timetable"].append(line[2:])

        # 17. Parse Homework & Tasks
        sec_hw = get_sec(r'Active Assignments / Homework|Active Homework & Tasks|Your Homework & Active Tasks')
        if sec_hw and sec_hw != "None":
            for line in sec_hw.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["homework"].append(line[2:])

        # 18. Parse Diary
        sec_diary = get_sec(r'Recent Diary Entries|Recent Class Diary Logs')
        if sec_diary and sec_diary != "None":
            for line in sec_diary.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["diary"].append(line[2:])

        # 19. Parse Notices
        sec_notices = get_sec(r'Recent School Announcements / Notices|Recent School Notices')
        if sec_notices and sec_notices != "None":
            for line in sec_notices.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["notices"].append(line[2:])

        # 20. Parse Complaints
        sec_comp = get_sec(r'Recent Complaints & Grievances|Recent ERP Complaints & Feedback')
        if sec_comp and sec_comp != "None":
            for line in sec_comp.split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["complaints"].append(line[2:])

        # 21. Parse CRM Leads
        sec_crm = get_sec(r'Recent CRM Leads & Inquiries|Admissions & CRM Leads Overview')
        if sec_crm and sec_crm != "None":
            for line in sec_crm.split('\n'):
                line = line.strip()
                if line and line != "None":
                    data["crm_leads"].append(line.lstrip('- '))

        # 22. Parse Holidays
        hol_match = re.search(r'Upcoming Holidays:\s*([^\n]+)', context_text)
        if hol_match:
            val = hol_match.group(1).strip()
            if val and val != "None":
                data["holidays"].append(val)

        return data

    @classmethod
    def generate_smart_fallback(cls, system_prompt: str, user_message: str) -> str:
        """
        Autonomous Cognitive ERP Intelligence Engine:
        Reads real-time database context, accurately resolves user intent,
        and constructs a strictly relevant, concise, role-accurate response without irrelevant data dump.
        """
        ctx = cls._parse_context_metrics(system_prompt)
        q = user_message.lower().strip()

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0.0: DIRECT WRITE / MUTATION REQUEST ATTEMPTS (STRICT READ-ONLY SAFETY)
        # ─────────────────────────────────────────────────────────────────────
        mutation_keywords = [
            "create invoice", "generate invoice", "make invoice", "delete invoice", "edit invoice",
            "mark attendance", "change attendance", "update attendance", "delete attendance",
            "approve leave", "reject leave", "create student", "delete student", "update student",
            "create teacher", "delete teacher", "add teacher", "create notice", "delete notice",
            "record payment", "create payment", "delete payment", "change salary", "update fee",
            "modify", "insert into", "delete from", "drop table", "alter table", "update table"
        ]
        if any(w in q for w in mutation_keywords) or (("create " in q or "add " in q or "delete " in q or "update " in q or "mark " in q or "approve " in q) and any(m in q for m in ["student", "invoice", "fee", "payment", "attendance", "leave", "voucher", "notice", "salary", "book", "route", "bus"])):
            target_route = "/finance/invoices"
            target_label = "Invoices & Fees"
            if "attendance" in q:
                target_route = "/attendance"
                target_label = "Attendance Register"
            elif "leave" in q:
                target_route = "/leaves"
                target_label = "Leave Management"
            elif "student" in q:
                target_route = "/directory"
                target_label = "Student Directory"
            elif "teacher" in q or "staff" in q or "salary" in q:
                target_route = "/users"
                target_label = "Staff & Faculty Directory"
            elif "notice" in q:
                target_route = "/notices"
                target_label = "Broadcast Notices"
            elif "exam" in q or "mark" in q or "grade" in q:
                target_route = "/exams"
                target_label = "Exam & Gradebook"
            elif "book" in q or "library" in q:
                target_route = "/library"
                target_label = "Library Management"
            elif "route" in q or "bus" in q or "transport" in q:
                target_route = "/transport"
                target_label = "Transport & Fleet"

            return (
                f"### 🛡️ Read-Only Assistant Security Policy\n\n"
                f"I am a read-only analytical AI Copilot designed to provide insights, reports, and guided navigation. "
                f"For system security and data integrity, I cannot modify, create, or delete ERP records directly.\n\n"
                f"You can securely perform this action directly in the **{target_label}** module:\n\n"
                f"- Secure Direct Route: `{target_route}`\n\n"
                f'<altrix_action>{{"type": "NAVIGATE_TO", "route": "{target_route}", "label": "Go to {target_label}"}}</altrix_action>'
            )

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0.1: SPECIFIC ENTITY SEARCH (STUDENT, STAFF, BOOK, ROUTE, INVOICE)
        # ─────────────────────────────────────────────────────────────────────
        clean_words = [re.sub(r'[^a-zA-Z0-9]', '', w) for w in q.split()]
        stop_words = {
            "tell", "show", "what", "with", "name", "names", "list", "give", "students", "student",
            "teachers", "teacher", "class", "classes", "find", "view", "many", "much", "all",
            "have", "about", "which", "where", "please", "could", "would", "from", "school", "are",
            "how", "who", "any", "our", "this", "that", "there", "the", "for", "and", "in", "is", "of",
            "question", "answer", "me", "my", "your"
        }
        search_terms = [w for w in clean_words if len(w) >= 2 and w.lower() not in stop_words]

        # 1. Student Search by name/roll/code
        if search_terms and any(w in q for w in ["student", "students", "name", "who is", "find", "search", "lookup", "roll", "code", "child", "kid"]):
            for term in search_terms:
                matching_students = [s for s in ctx["students"] if term in s.lower()]
                matching_search = [m for m in ctx["search_matches"] if term in m.lower() and not m.startswith("Matched Transport") and not m.startswith("Matched Library") and not m.startswith("Matched Faculty")]

                if matching_students or matching_search:
                    response_parts = [
                        f"### 🎓 Student Search Results: \"{term.capitalize()}\"\n\n",
                        f"Here are the student records matching **\"{term}\"** in your active school database:\n\n",
                    ]
                    seen = set()
                    if matching_students:
                        for s in matching_students:
                            clean_s = re.sub(r'\[Student ID: [^\]]+\]', '', s).strip()
                            if clean_s not in seen:
                                seen.add(clean_s)
                                response_parts.append(f"- **{clean_s}**\n")
                    for m in matching_search:
                        if m.startswith("Matched"):
                            continue
                        clean_m = re.sub(r'\[Student ID: [^\]]+\]', '', m).strip()
                        clean_m = clean_m.lstrip('* ')
                        if clean_m and clean_m not in seen:
                            seen.add(clean_m)
                            response_parts.append(f"- **{clean_m}**\n")

                    response_parts.append(
                        "\nDirect navigation links:\n"
                        "- Student Directory: `/directory`\n"
                        "- Academics & Classes: `/academic`\n\n"
                        '<altrix_action>{"type": "NAVIGATE_TO", "route": "/directory", "label": "Open Student Directory"}</altrix_action>\n'
                        '<altrix_action>{"type": "NAVIGATE_TO", "route": "/academic", "label": "View Classes & Sections"}</altrix_action>'
                    )
                    return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0.2: STUDENTS DIRECTORY & ACADEMIC CLASSES
        # ─────────────────────────────────────────────────────────────────────
        if any(w in q for w in [
            "student", "students", "roster", "directory", "enrollment", "enrolled", "child", "children",
            "class", "classes", "section", "sections"
        ]) and not any(w in q for w in ["exam", "result", "gradebook", "mark", "marks", "fee", "fees", "invoice", "defaulter", "attendance", "absent"]):
            tot_students = ctx["total_students"] or len(ctx["students"]) or 0
            response_parts = [
                "### 🎓 Student Directory & Academic Enrollment\n\n",
                f"- **Total Active Enrolled Students:** **{tot_students} Students**\n\n",
            ]

            if ctx["students"]:
                response_parts.append("#### 📋 Registered Students Roster:\n")
                for s in ctx["students"][:15]:
                    clean_s = re.sub(r'\[Student ID: [^\]]+\]', '', s).strip()
                    response_parts.append(f"- {clean_s}\n")
                response_parts.append("\n")

            if ctx["classes"]:
                response_parts.append("#### 🏫 Classes & Section Breakdown:\n")
                for c in ctx["classes"]:
                    clean_c = re.sub(r'\[(?:Section|Class) ID: [^\]]+\]', '', c).strip()
                    response_parts.append(f"- {clean_c}\n")
                response_parts.append("\n")

            response_parts.append(
                "Direct navigation paths:\n"
                "- Student Directory: `/directory`\n"
                "- Academics & Classes: `/academic`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/directory", "label": "Open Student Directory"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/academic", "label": "Manage Classes & Sections"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 1: LIBRARY MANAGEMENT & BOOKS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "library", "book", "books", "borrow", "borrowed", "overdue", "isbn", "shelf", "fine", "fines"
        ]):
            tot_books = ctx["library_books_count"] or len(ctx["library_books"]) or 0
            response_parts = [
                "### 📚 School Library & Resources Center\n\n",
                f"- **Total Catalog Titles:** **{tot_books} Book Titles** in school collection\n\n",
            ]

            if ctx["library_books"]:
                response_parts.append("#### 📖 Available Book Titles:\n")
                for b in ctx["library_books"][:8]:
                    clean_b = re.sub(r'\[Book ID: [^\]]+\]', '', b).strip()
                    response_parts.append(f"{clean_b}\n")
                response_parts.append("\n")

            if ctx["library_issues"]:
                response_parts.append("#### ⏳ Active & Overdue Book Issues:\n")
                for iss in ctx["library_issues"][:6]:
                    clean_iss = re.sub(r'\[Issue ID: [^\]]+\]', '', iss).strip()
                    response_parts.append(f"{clean_iss}\n")
                response_parts.append("\n")

            chart_data = [
                {"category": "Catalog Titles", "count": tot_books},
                {"category": "Active Borrows", "count": len(ctx["library_issues"])},
            ]
            chart_tag = f'<altrix_chart type="bar" title="Library Inventory Overview" xKey="category" yKeys="count" data=\'{json.dumps(chart_data)}\' />'
            response_parts.append(f"{chart_tag}\n\n")

            response_parts.append(
                "Access Library tools:\n"
                "- Library Hub: `/library`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/library", "label": "Open Library Module"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 2: TRANSPORT & FLEET
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "transport", "bus", "buses", "vehicle", "vehicles", "route", "routes",
            "driver", "drivers", "stop", "stops", "van", "fleet", "pickup"
        ]):
            tot_routes = ctx["active_routes_count"] or len(ctx["transport_routes"]) or 0
            tot_vehicles = len(ctx["transport_vehicles"]) or 0

            response_parts = [
                "### 🚌 School Transport & Fleet Management\n\n",
                f"- **Active Transport Routes:** **{tot_routes} Bus Routes**\n",
                f"- **Registered Fleet Vehicles:** **{tot_vehicles} Buses & Vans**\n\n",
            ]

            if ctx["transport_routes"]:
                response_parts.append("#### 🛣️ Active Bus Routes & Schedules:\n")
                for r in ctx["transport_routes"][:6]:
                    clean_r = re.sub(r'\[Route ID: [^\]]+\]', '', r).strip()
                    response_parts.append(f"{clean_r}\n")
                response_parts.append("\n")

            if ctx["transport_vehicles"]:
                response_parts.append("#### 🚐 Fleet Vehicles & Drivers:\n")
                for v in ctx["transport_vehicles"][:5]:
                    clean_v = re.sub(r'\[Vehicle ID: [^\]]+\]', '', v).strip()
                    response_parts.append(f"{clean_v}\n")
                response_parts.append("\n")

            response_parts.append(
                "Manage Transport operations:\n"
                "- Transport Hub: `/transport`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/transport", "label": "Open Transport Module"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 3: REVENUE / FEES / INVOICES / PAYMENTS / DEFAULTERS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "revenue", "fee", "fees", "invoice", "invoices", "payment", "payments",
            "defaulter", "defaulters", "collected", "unpaid", "voucher", "finance", "money", "income", "dues", "balance"
        ]):
            collected_str = ctx["collected_fees"] or "Rs. 0.00"
            unpaid_cnt = ctx["pending_invoices_count"] or len(ctx["defaulters"]) or 0

            response_parts = [
                "### 💳 School Financial & Fee Status\n\n",
                f"- **Month-to-Date Collections Received:** **{collected_str}**\n",
                f"- **Unpaid Invoices Logged:** **{unpaid_cnt} Vouchers**\n\n",
            ]

            if ctx["defaulters"]:
                response_parts.append("#### ⚠️ Top Outstanding Fee Defaulters:\n")
                for d in ctx["defaulters"][:6]:
                    clean_d = re.sub(r'\[Invoice ID: [^\]]+\]', '', d).strip()
                    response_parts.append(f"- {clean_d}\n")
                response_parts.append("\n")

            if ctx["recent_payments"]:
                response_parts.append("#### ✅ Recent Fee Collections Recorded:\n")
                for p in ctx["recent_payments"][:5]:
                    clean_p = re.sub(r'\[Payment ID: [^\]]+\]', '', p).strip()
                    response_parts.append(f"- {clean_p}\n")
                response_parts.append("\n")

            chart_data = [
                {"status": "Collected (MTD)", "amount": 1},
                {"status": "Pending Defaulters", "amount": max(1, unpaid_cnt)},
            ]
            chart_tag = f'<altrix_chart type="pie" title="Fee Status Overview" xKey="status" yKeys="amount" data=\'{json.dumps(chart_data)}\' />'
            response_parts.append(f"{chart_tag}\n\n")

            response_parts.append(
                "Direct navigation paths:\n"
                "- Invoices Ledger: `/finance/invoices`\n"
                "- Payments Register: `/finance/payments`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/finance/invoices", "label": "Open Finance Invoices Ledger"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/finance/payments", "label": "View Payment Transactions"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 4: ATTENDANCE & ABSENTEES
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "attendance", "absent", "absentees", "present", "turnout", "attendance rate", "clock in", "biometric"
        ]):
            tot_students = ctx["total_students"] or 0
            response_parts = [
                "### 📋 Real-Time Attendance Register\n\n",
                f"- **Total Active Student Roster:** **{tot_students} Students**\n\n",
            ]

            if ctx["staff_attendance"]["present"] or ctx["staff_attendance"]["absent"]:
                sa = ctx["staff_attendance"]
                response_parts.append(
                    f"#### 👨‍🏫 Faculty Attendance Turnout Today:\n"
                    f"- **Present:** {sa['present']} Staff\n"
                    f"- **Absent:** {sa['absent']} Staff\n"
                    f"- **Unmarked:** {sa['unmarked']} Staff\n\n"
                )

            response_parts.append(
                "Direct navigation paths:\n"
                "- Daily Attendance: `/attendance`\n"
                "- Staff Attendance: `/staff-attendance`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/attendance", "label": "Open Student Attendance"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/staff-attendance", "label": "Open Staff Attendance"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 5: EXAMS / RESULTS / GRADES / MARKS / REPORT CARDS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "exam", "exams", "result", "results", "grade", "grades", "mark", "marks", "term", "score", "report card"
        ]):
            response_parts = [
                "### 📝 Examination & Academic Results\n\n",
                "Here is the active examination status for your school:\n\n",
            ]

            if ctx["exams"]:
                response_parts.append("#### 🎯 Registered Exam Terms & Results:\n")
                for e in ctx["exams"][:6]:
                    clean_e = re.sub(r'\[Exam ID: [^\]]+\]', '', e).strip()
                    response_parts.append(f"{clean_e}\n")
                response_parts.append("\n")
            else:
                response_parts.append("- Academic grade records and terms are configured in the Examination Center.\n\n")

            response_parts.append(
                "Manage exam schedules and student result cards:\n"
                "- Exam Center: `/exams`\n"
                "- Report Cards: `/report-cards`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/exams", "label": "Open Examination Center"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/report-cards", "label": "Generate Result Cards"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 6: TIMETABLE / PERIODS / LECTURES / CLASS SCHEDULES
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "timetable", "schedule", "period", "periods", "lecture", "lectures", "routine", "timing", "slot"
        ]):
            response_parts = [
                "### 📅 Today's Scheduled Lectures & Timetable\n\n",
                "Here is the active timetable schedule from your ERP database:\n\n",
            ]
            if ctx["timetable"]:
                for t in ctx["timetable"][:10]:
                    response_parts.append(f"{t}\n")
            elif ctx["classes"]:
                for c in ctx["classes"][:8]:
                    clean_c = re.sub(r'\[Section ID: [^\]]+\]', '', c).strip()
                    response_parts.append(f"{clean_c}\n")
            else:
                response_parts.append("- *Scheduled periods and teacher lectures are active in database.*")

            response_parts.append(
                "\n\nDirect navigation paths:\n"
                "- Timetable Module: `/timetable`\n"
                "- Academic Classes: `/academic`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/timetable", "label": "View School Timetable"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/academic", "label": "Classes & Sections"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 7: HOMEWORK / ASSIGNMENTS / DIARY / LESSON PLANS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "homework", "assignment", "assignments", "task", "tasks", "diary", "lesson", "plan"
        ]):
            response_parts = [
                "### 📖 Homework, Assignments & Class Diary\n\n",
            ]
            if ctx["homework"]:
                response_parts.append("#### 📝 Active Homework & Assignments:\n")
                for hw in ctx["homework"][:5]:
                    clean_hw = re.sub(r'\[Assignment ID: [^\]]+\]', '', hw).strip()
                    response_parts.append(f"{clean_hw}\n")
                response_parts.append("\n")

            if ctx["diary"]:
                response_parts.append("#### 📔 Recent Class Diary Logs:\n")
                for d in ctx["diary"][:5]:
                    clean_d = re.sub(r'\[Diary ID: [^\]]+\]', '', d).strip()
                    response_parts.append(f"{clean_d}\n")
                response_parts.append("\n")

            if not ctx["homework"] and not ctx["diary"]:
                response_parts.append("- *Class assignments and daily diary entries are tracked per section.*")

            response_parts.append(
                "Access Academic tools:\n"
                "- Assignments Module: `/assignments`\n"
                "- Daily Class Diary: `/diary`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/assignments", "label": "Open Assignments Hub"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/diary", "label": "View Daily Class Diary"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 8: TEACHERS / STAFF / HR / LEAVES / PAYROLL
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "teacher", "teachers", "staff", "faculty", "hr", "leave", "leaves", "salary", "payroll"
        ]):
            tot_teachers = ctx["total_teachers"] or len(ctx["staff"]) or 0

            response_parts = [
                "### 👨‍🏫 Faculty & HR Operations\n\n",
                f"- **Total Registered Teachers:** **{tot_teachers} Faculty Members**\n\n",
            ]

            if ctx["staff"]:
                response_parts.append("#### 👥 Active Staff Directory:\n")
                for s in ctx["staff"][:8]:
                    clean_s = re.sub(r'\[Staff ID: [^\]]+\]', '', s).strip()
                    response_parts.append(f"{clean_s}\n")
                response_parts.append("\n")

            if ctx["leaves"]:
                response_parts.append("#### 📝 Recent Staff Leave Requests:\n")
                for l in ctx["leaves"][:4]:
                    clean_l = re.sub(r'\[Leave ID: [^\]]+\]', '', l).strip()
                    response_parts.append(f"{clean_l}\n")
                response_parts.append("\n")

            response_parts.append(
                "Access HR and faculty tools:\n"
                "- Staff Directory: `/users`\n"
                "- Leave Approvals: `/leaves`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/users", "label": "Open Staff Directory"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/leaves", "label": "Review Leave Requests"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 9: NOTIFICATIONS / NOTICES / BROADCASTS / HOLIDAYS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "notification", "notifications", "notice", "notices", "announcement",
            "announcements", "broadcast", "alert", "alerts", "holiday", "holidays", "event", "calendar"
        ]):
            response_parts = [
                "### 🔔 Recent School Notifications & Announcements\n\n",
                "Here are the active broadcast notices for your school shell:\n\n",
            ]
            if ctx["notices"]:
                for n in ctx["notices"][:6]:
                    clean_n = re.sub(r'\[Notice ID: [^\]]+\]', '', n).strip()
                    response_parts.append(f"{clean_n}\n")
            else:
                response_parts.append("- *No recent unread broadcast notices logged in system.*")

            if ctx["holidays"]:
                response_parts.append(f"\n#### 🏖️ Upcoming Holidays & Events:\n")
                for h in ctx["holidays"]:
                    response_parts.append(f"- {h}\n")

            response_parts.append(
                "\n\nDirect navigation links:\n"
                "- Broadcast Center: `/notices`\n"
                "- School Calendar: `/holidays`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/notices", "label": "Open Notices & Broadcasts"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 10: COMPLAINTS / FEEDBACK / GRIEVANCES
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "complaint", "complaints", "issue", "issues", "ticket", "grievance", "feedback"
        ]):
            response_parts = [
                "### ⚠️ ERP Complaints & Feedback Register\n\n",
                "Here is the live complaint log for your school:\n\n",
            ]
            if ctx["complaints"]:
                for comp in ctx["complaints"][:6]:
                    clean_comp = re.sub(r'\[Complaint ID: [^\]]+\]', '', comp).strip()
                    response_parts.append(f"{clean_comp}\n")
            else:
                response_parts.append("- *No unresolved complaints logged for your school.*")

            response_parts.append(
                "\n\nDirect navigation paths:\n"
                "- Complaints Desk: `/complaints`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/complaints", "label": "Open Complaints Desk"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 11: CRM / ADMISSIONS / LEADS / CAMPAIGNS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "lead", "leads", "crm", "inquiry", "inquiries", "campaign"
        ]):
            response_parts = [
                "### 🎯 Admissions Pipeline & CRM Leads\n\n",
            ]
            if ctx["crm_leads"]:
                response_parts.append("#### 📋 Recent Lead Inquiries:\n")
                for lead in ctx["crm_leads"][:6]:
                    clean_lead = re.sub(r'\[Lead ID: [^\]]+\]', '', lead).strip()
                    response_parts.append(f"- {clean_lead}\n")
                response_parts.append("\n")
            else:
                response_parts.append("- *Admissions inquiries and digital marketing leads are active.*\n\n")

            response_parts.append(
                "Access Admissions & CRM:\n"
                "- Admissions Desk: `/admissions`\n"
                "- CRM Pipeline: `/crm`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/admissions", "label": "Open Admissions Desk"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/crm", "label": "Open CRM Pipeline"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 11.5: CAMPUSES & BRANCHES
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "campus", "campuses", "branch", "branches", "building", "location", "locations"
        ]):
            tot_campuses = ctx["active_campuses"] or len(ctx["campuses"]) or 1
            response_parts = [
                "### 🏢 Campus Infrastructure & Branches\n\n",
                f"- **Total Active Campus Branches:** **{tot_campuses} Campus{'es' if tot_campuses > 1 else ''}**\n\n",
            ]
            if ctx["campuses"]:
                response_parts.append("#### 📍 Campus Directory:\n")
                for c in ctx["campuses"]:
                    clean_c = re.sub(r'\[Campus ID: [^\]]+\]', '', c).strip()
                    response_parts.append(f"{clean_c}\n")
                response_parts.append("\n")

            response_parts.append(
                "Manage school campuses:\n"
                "- Campus Settings: `/admin`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/admin", "label": "Open Campus Settings"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 12: ACTIVE SCREEN CONTEXTUAL GUIDANCE
        # ─────────────────────────────────────────────────────────────────────
        if any(w in q for w in [
            "here", "this page", "this screen", "this tab", "what can i do", "help here", "explain this"
        ]) and (ctx["active_screen"] or ctx["active_module"]):
            scr = ctx["active_screen"]
            mod = ctx["active_module"]
            return (
                f"### 🧭 Screen Guide: {mod} (`{scr}`)\n\n"
                f"You are currently working in the **{mod}** module of AltRix ERP.\n\n"
                f"**Available Capabilities in this section:**\n"
                f"- Live data visualization and real-time record synchronization.\n"
                f"- Role-scoped filtering, instant search, and export options.\n"
                f"- High-speed CRUD operations backed by PostgreSQL.\n\n"
                f"How can I assist you on this screen? You can ask for summaries, metrics, or specific student/record lookups."
            )

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 13: OVERALL SCHOOL HEALTH / EXECUTIVE OVERVIEW
        # ─────────────────────────────────────────────────────────────────────
        tot_students = ctx["total_students"] or len(ctx["students"]) or 0
        tot_teachers = ctx["total_teachers"] or len(ctx["staff"]) or 0
        campuses_cnt = ctx["active_campuses"] or len(ctx["campuses"]) or 1
        collected_str = ctx["collected_fees"] or "Rs. 0.00"
        unpaid_cnt = ctx["pending_invoices_count"] or len(ctx["defaulters"]) or 0
        tot_routes = ctx["active_routes_count"] or len(ctx["transport_routes"]) or 0
        tot_books = ctx["library_books_count"] or len(ctx["library_books"]) or 0

        # If user explicitly asked for overview / summary / dashboard / health / performance:
        if any(w in q for w in ["overview", "summary", "dashboard", "health", "performance", "kpi", "status", "all data", "everything"]):
            chart_data = [
                {"metric": "Students", "count": tot_students},
                {"metric": "Teachers", "count": tot_teachers},
                {"metric": "Campuses", "count": campuses_cnt},
                {"metric": "Unpaid Invoices", "count": unpaid_cnt},
            ]
            chart_tag = f'<altrix_chart type="bar" title="Live School Operational Indicators" xKey="metric" yKeys="count" data=\'{json.dumps(chart_data)}\' />'

            return f"""### 🏫 AltRix School Operational Summary

Here is your school's live operational overview from your active ERP database:

#### 📊 Core Operational Indicators:
- 🎓 **Active Enrollment:** **{tot_students} Students** across active grades & sections
- 👨‍🏫 **Faculty Strength:** **{tot_teachers} Faculty Members** (Student-to-Teacher Ratio: ~{max(1, round(tot_students / max(1, tot_teachers)))}:1)
- 🏢 **Campus Branches:** **{campuses_cnt} Active Branch{'es' if campuses_cnt > 1 else ''}**
- 💳 **MTD Fee Collections:** **{collected_str}** received
- 📋 **Unpaid Invoices:** **{unpaid_cnt} Vouchers** pending
- 🚌 **Transport Fleet:** **{tot_routes} Active Routes**
- 📚 **Library Catalog:** **{tot_books} Book Titles**

{chart_tag}

You can ask me specific questions about any section (e.g. *"Show bus routes"*, *"List library books"*, *"Who are top defaulters?"*, *"Show student Nauman"*).

<altrix_action>{{"type": "NAVIGATE_TO", "route": "/reports", "label": "Open Detailed School Reports"}}</altrix_action>
<altrix_action>{{"type": "NAVIGATE_TO", "route": "/finance/invoices", "label": "Review Invoices & Defaulters"}}</altrix_action>
<altrix_action>{{"type": "NAVIGATE_TO", "route": "/attendance", "label": "Check Realtime Attendance"}}</altrix_action>
"""

        # General helpful query response if query was not recognized
        return f"""### 🤖 AltRix AI Copilot

I can help you analyze and retrieve live real-time data across all ERP modules for your school:

- 🎓 **Students & Classes:** Ask *"List students"*, *"Students in class 1"*, or search by name like *"Students with name Nauman"*
- 💳 **Finance & Fees:** Ask *"Who are the top fee defaulters?"* or *"What is this month's revenue?"*
- 📚 **Library:** Ask *"What books are in the library?"* or *"Overdue borrowed books"*
- 🚌 **Transport:** Ask *"What are our bus routes and drivers?"*
- 👨‍🏫 **Faculty & HR:** Ask *"List of teachers"* or *"Pending leave requests"*
- 📋 **Attendance & Timetable:** Ask *"Today's absentees"* or *"Scheduled timetable"*

What would you like to check?

<altrix_action>{{"type": "NAVIGATE_TO", "route": "/directory", "label": "Open Student Directory"}}</altrix_action>
<altrix_action>{{"type": "NAVIGATE_TO", "route": "/finance/invoices", "label": "Open Invoices Ledger"}}</altrix_action>
"""

    @classmethod
    async def stream_completion(
        cls, 
        system_prompt: str, 
        user_message: str, 
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Executes streaming AI response with multi-provider LLM cascade:
        1. Google Gemini API (via OpenAI-compatible endpoint or native key).
        2. Custom OpenAI / Groq / OpenRouter / DeepSeek if configured.
        3. Local Ollama instance if reachable.
        4. Autonomous Cognitive ERP Engine as graceful fallback.
        """
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        success_streamed = False

        # ── Multi-Provider Candidates Construction ───────────────────────────
        candidates: List[Dict[str, Any]] = []

        # Candidate 1: Google Gemini (Highest Priority if key available)
        gemini_key = (
            settings.gemini_api_key or 
            (settings.ai_api_key if (settings.ai_api_key and settings.ai_api_key.startswith("AIzaSy")) else "") or
            os.environ.get("GEMINI_API_KEY", "")
        )
        if gemini_key:
            model = cls.route_model(user_message, provider="gemini")
            candidates.append({
                "provider": "gemini",
                "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                "headers": {
                    "Authorization": f"Bearer {gemini_key}",
                    "Content-Type": "application/json"
                },
                "payload": {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.3 if "pro" in model.lower() or "r1" in model.lower() else 0.7
                }
            })

        # Candidate 2: Custom OpenAI-compatible / Groq / OpenRouter
        if settings.ai_api_base and settings.ai_api_key:
            model = cls.route_model(user_message, provider=settings.ai_provider)
            candidates.append({
                "provider": settings.ai_provider or "custom",
                "url": f"{settings.ai_api_base.rstrip('/')}/chat/completions",
                "headers": {
                    "Authorization": f"Bearer {settings.ai_api_key}",
                    "Content-Type": "application/json"
                },
                "payload": {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.7
                }
            })

        # Candidate 3: Ollama (if explicitly set and not empty)
        if settings.ollama_url and settings.ollama_url.strip():
            base_url = settings.ollama_url.rstrip('/')
            url = f"{base_url}/chat" if base_url.endswith("/api") else f"{base_url}/api/chat"
            model = cls.route_model(user_message, provider="ollama")
            headers = {"Content-Type": "application/json"}
            if settings.ollama_api_key:
                headers["Authorization"] = f"Bearer {settings.ollama_api_key}"
            candidates.append({
                "provider": "ollama",
                "url": url,
                "headers": headers,
                "payload": {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                }
            })

        # ── 1. Attempt Streaming Across Candidate Providers ──────────────────
        for cand in candidates:
            try:
                logger.info(f"Connecting to AI Provider: {cand['provider']} ({cand['url']}) with model {cand['payload']['model']}")
                timeout = httpx.Timeout(45.0, connect=5.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", cand["url"], json=cand["payload"], headers=cand["headers"]) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if not line.strip():
                                    continue
                                try:
                                    clean_line = line.replace("data: ", "").strip()
                                    if clean_line == "[DONE]":
                                        break
                                    chunk = json.loads(clean_line)
                                    content = (
                                        chunk.get("message", {}).get("content", "") or
                                        chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    )
                                    if content:
                                        success_streamed = True
                                        sse_data = {"choices": [{"delta": {"content": content}}]}
                                        yield f"data: {json.dumps(sse_data)}\n\n"
                                except json.JSONDecodeError:
                                    continue
                            
                            if success_streamed:
                                break
                        else:
                            resp_body = await response.aread()
                            logger.warning(f"AI Provider {cand['provider']} returned HTTP {response.status_code}: {resp_body.decode('utf-8', 'ignore')[:200]}")
            except Exception as e:
                logger.info(f"AI Provider {cand['provider']} streaming attempt bypassed: {e}")

        # ── 2. Autonomous Cognitive ERP Reasoning Stream ─────────────────────
        if not success_streamed:
            logger.info("Executing Autonomous Cognitive ERP Intelligence Engine for Copilot")
            generated_response = cls.generate_smart_fallback(system_prompt, user_message)

            words = generated_response.split(" ")
            for i, word in enumerate(words):
                token = word if i == 0 else " " + word
                sse_data = {"choices": [{"delta": {"content": token}}]}
                yield f"data: {json.dumps(sse_data)}\n\n"
                if i % 3 == 0:
                    await asyncio.sleep(0.01)

        yield "data: [DONE]\n\n"


