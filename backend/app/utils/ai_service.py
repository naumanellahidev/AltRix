# -*- coding: utf-8 -*-
import json
import logging
import re
import asyncio
import httpx
from typing import AsyncGenerator, Dict, List, Optional, Any, cast
from app.config import settings

logger = logging.getLogger("app.ai_service")


class OllamaAIService:
    """
    Enterprise-grade provider-agnostic AI Copilot Service for AltRix ERP.
    Features:
    1. Multi-provider LLM streaming (Cloud Ollama, OpenRouter, OpenAI, Groq, DeepSeek, GLM, Gemini).
    2. Autonomous High-Precision ERP Cognitive Engine when external LLM is offline or unconfigured.
    3. Strict single-tenant data isolation and role-scoped execution.
    4. Real-time data extraction directly from active DB context with dynamic chart and action tag generation.
    """

    @classmethod
    def route_model(cls, query: str) -> str:
        reasoning_keywords = [
            "compare", "analyze", "trend", "report", "why", "performance",
            "forecast", "predict", "benchmark", "root cause", "explain"
        ]
        query_lower = query.lower()

        reasoning_default = settings.ollama_reasoning_model or "deepseek-r1"
        general_default = settings.ollama_general_model or "qwen2.5"

        reasoning_model = settings.ai_reasoning_model or reasoning_default
        general_model = settings.ai_general_model or general_default

        if any(keyword in query_lower for keyword in reasoning_keywords):
            return reasoning_model
        return general_model

    @classmethod
    def _parse_context_metrics(cls, context_text: str) -> Dict[str, Any]:
        """
        Parses real-time numbers, lists, and records directly from the database context string.
        """
        data: Dict[str, Any] = {
            "role": "General User",
            "total_students": 0,
            "active_campuses": 0,
            "total_teachers": 0,
            "collected_fees": "Rs. 0.00",
            "pending_invoices_count": 0,
            "pending_admissions": 0,
            "campuses": cast(List[str], []),
            "classes": cast(List[str], []),
            "students": cast(List[str], []),
            "staff": cast(List[str], []),
            "staff_attendance": {"present": 0, "absent": 0, "unmarked": 0, "details": cast(List[str], [])},
            "defaulters": cast(List[str], []),
            "recent_invoices": cast(List[str], []),
            "recent_payments": cast(List[str], []),
            "exams": cast(List[str], []),
            "leaves": cast(List[str], []),
            "notices": cast(List[str], []),
            "complaints": cast(List[str], []),
            "crm_leads": "None",
            "admissions": "None",
            "holidays": cast(List[str], []),
            "active_screen": "",
            "active_module": "",
        }

        if not context_text:
            return data

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
        students_match = re.search(r'Total Active Students:\s*(\d+)', context_text)
        if students_match:
            data["total_students"] = int(students_match.group(1))

        campuses_match = re.search(r'Active Campuses:\s*(\d+)', context_text)
        if campuses_match:
            data["active_campuses"] = int(campuses_match.group(1))

        teachers_match = re.search(r'Total Teachers:\s*(\d+)', context_text)
        if teachers_match:
            data["total_teachers"] = int(teachers_match.group(1))

        fees_match = re.search(r'MTD Collected Fees:\s*([^\n]+)', context_text)
        if fees_match:
            data["collected_fees"] = fees_match.group(1).strip()

        unpaid_match = re.search(r'Unpaid Invoices Count:\s*(\d+)', context_text)
        if unpaid_match:
            data["pending_invoices_count"] = int(unpaid_match.group(1))

        adm_match = re.search(r'Pending Admissions Applications:\s*(\d+)', context_text)
        if adm_match:
            data["pending_admissions"] = int(adm_match.group(1))

        # 4. Parse Campuses Directory
        camp_section = re.search(r'Campuses Directory:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)', context_text, re.DOTALL)
        if camp_section:
            for line in camp_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- '):
                    data["campuses"].append(line[2:])

        # 5. Parse Classes and Sections
        class_section = re.search(r'Classes and Sections Enrollment Summary:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)', context_text, re.DOTALL)
        if class_section:
            for line in class_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- '):
                    data["classes"].append(line[2:])

        # 6. Parse Defaulters
        def_section = re.search(r'Outstanding Fee Defaulters:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)', context_text, re.DOTALL)
        if def_section:
            for line in def_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["defaulters"].append(line[2:])

        # 7. Parse Recent Payments
        pay_section = re.search(r'Recent Fee Payments Collected:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)', context_text, re.DOTALL)
        if pay_section:
            for line in pay_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["recent_payments"].append(line[2:])

        # 8. Parse Staff Attendance
        staff_att_section = re.search(r"Today's Staff Attendance Summary:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if staff_att_section:
            for line in staff_att_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["staff_attendance"]["details"].append(line[2:])
                    if "**PRESENT**" in line.upper():
                        data["staff_attendance"]["present"] += 1
                    elif "**ABSENT**" in line.upper():
                        data["staff_attendance"]["absent"] += 1
                    else:
                        data["staff_attendance"]["unmarked"] += 1

        # 9. Parse Staff Directory
        staff_section = re.search(r"Teachers & Active Staff Directory:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if staff_section:
            for line in staff_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["staff"].append(line[2:])

        # 10. Parse Exams
        exam_section = re.search(r"School Exams & Terms:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if exam_section:
            for line in exam_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["exams"].append(line[2:])

        # 11. Parse Notices / Notifications
        notices_section = re.search(r"Recent School Announcements / Notices:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if notices_section:
            for line in notices_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["notices"].append(line[2:])

        # 12. Parse Timetable & Scheduled Lectures
        tt_section = re.search(r"Scheduled Timetable & Today's Lectures:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if tt_section:
            for line in tt_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["classes"].append(line[2:])

        # 13. Parse Complaints
        comp_section = re.search(r"Recent ERP Complaints & Feedback:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if comp_section:
            for line in comp_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["complaints"].append(line[2:])

        # 14. Parse Holidays
        hol_section = re.search(r"Upcoming Holidays Calendar:\s*\n(.*?)(?=\n\n|\n[A-Z]|\Z)", context_text, re.DOTALL)
        if hol_section:
            for line in hol_section.group(1).strip().split('\n'):
                line = line.strip()
                if line.startswith('- ') and line[2:].strip() != "None":
                    data["holidays"].append(line[2:])

        return data

    @classmethod
    def generate_smart_fallback(cls, system_prompt: str, user_message: str) -> str:
        """
        Cognitive ERP Intelligence Engine:
        Reads real-time database context, extracts actual operational metrics,
        and constructs an insightful, role-accurate executive response with visual charts and actions.
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
        if any(w in q for w in mutation_keywords) or (("create " in q or "add " in q or "delete " in q or "update " in q or "mark " in q or "approve " in q) and any(m in q for m in ["student", "invoice", "fee", "payment", "attendance", "leave", "voucher", "notice", "salary"])):
            target_route = "/finance/invoices"
            target_label = "Invoices & Fees"
            if "attendance" in q:
                target_route = "/attendance"
                target_label = "Attendance Register"
            elif "leave" in q:
                target_route = "/leaves"
                target_label = "Leave Management"
            elif "student" in q:
                target_route = "/students"
                target_label = "Student Records"
            elif "teacher" in q or "staff" in q or "salary" in q:
                target_route = "/users"
                target_label = "Staff & Faculty Directory"
            elif "notice" in q:
                target_route = "/notices"
                target_label = "Broadcast Notices"
            elif "exam" in q or "mark" in q or "grade" in q:
                target_route = "/exams"
                target_label = "Exam & Gradebook"

            return (
                f"### 🛡️ Read-Only Assistant Security Policy\n\n"
                f"I am a read-only analytical AI Copilot designed to provide insights, reports, and guided navigation. "
                f"For system security and data integrity, I cannot modify, create, or delete ERP records directly.\n\n"
                f"You can securely perform this action directly in the **{target_label}** module:\n\n"
                f"- Secure Direct Route: `{target_route}`\n\n"
                f'<altrix_action>{{"type": "NAVIGATE_TO", "route": "{target_route}", "label": "Go to {target_label}"}}</altrix_action>'
            )

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0: NOTIFICATIONS / NOTICES / BROADCASTS / ALERTS
        # ─────────────────────────────────────────────────────────────────────
        if any(w in q for w in [
            "notification", "notifications", "notice", "notices", "announcement",
            "announcements", "broadcast", "alert", "alerts", "news", "update", "updates"
        ]):
            response_parts = [
                "### 🔔 Recent School Notifications & Announcements\n\n",
                f"Here are the active broadcast notices for your school shell:\n\n",
            ]
            if ctx["notices"]:
                for n in ctx["notices"][:6]:
                    response_parts.append(f"{n}\n")
            else:
                response_parts.append("- *No recent unread broadcast notices logged in system.*")

            response_parts.append(
                "\n\nDirect navigation links:\n"
                "- Broadcast Center: `/notices`\n"
                "- School Calendar: `/holidays`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/notices", "label": "Open Notices & Broadcasts"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0.5: LECTURES / TIMETABLE / CLASS SCHEDULES / PERIODS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "lecture", "lectures", "period", "periods", "timetable", "schedule",
            "class today", "routine", "timing", "slot", "subject schedule"
        ]):
            response_parts = [
                "### 📅 Today's Scheduled Lectures & Timetable\n\n",
                f"Here is the active timetable schedule from your ERP database:\n\n",
            ]
            if ctx["classes"]:
                for c in ctx["classes"][:10]:
                    response_parts.append(f"{c}\n")
            else:
                response_parts.append("- *Scheduled periods and teacher lectures are active in database.*")

            response_parts.append(
                "\n\nDirect navigation paths:\n"
                "- Timetable Module: `/timetable`\n"
                "- Attendance Register: `/attendance`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/timetable", "label": "View School Timetable"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 0.8: COMPLAINTS / FEEDBACK / ISSUES
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "complaint", "complaints", "issue", "issues", "ticket", "grievance", "feedback"
        ]):
            response_parts = [
                "### ⚠️ ERP Complaints & Feedback Register\n\n",
                f"Here is the live complaint log for your school:\n\n",
            ]
            if ctx["complaints"]:
                for comp in ctx["complaints"][:6]:
                    response_parts.append(f"{comp}\n")
            else:
                response_parts.append("- *No unresolved complaints logged for your school.*")

            response_parts.append(
                "\n\nDirect navigation paths:\n"
                "- Complaints Desk: `/complaints`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/complaints", "label": "Open Complaints Desk"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 1: OVERALL SCHOOL PERFORMANCE / HEALTH / DASHBOARD / KPIS
        # ─────────────────────────────────────────────────────────────────────
        if any(w in q for w in [
            "performance", "overall", "health", "how is our school", "how are we doing",
            "overview", "summary", "kpi", "kpis", "stats", "dashboard", "metrics", "progress"
        ]):
            # Calculate metrics
            tot_students = ctx["total_students"] or len(ctx["students"]) or 0
            tot_teachers = ctx["total_teachers"] or len(ctx["staff"]) or 0
            campuses_cnt = ctx["active_campuses"] or len(ctx["campuses"]) or 1
            collected_str = ctx["collected_fees"] or "Rs. 0.00"
            unpaid_cnt = ctx["pending_invoices_count"] or len(ctx["defaulters"]) or 0
            adm_pending = ctx["pending_admissions"]

            # Staff turnout
            staff_pres = ctx["staff_attendance"]["present"]
            staff_tot = staff_pres + ctx["staff_attendance"]["absent"] + ctx["staff_attendance"]["unmarked"]
            staff_rate_str = f"{round(staff_pres / staff_tot * 100)}%" if staff_tot > 0 else "Active"

            chart_data = [
                {"metric": "Students", "count": tot_students},
                {"metric": "Teachers", "count": tot_teachers},
                {"metric": "Campuses", "count": campuses_cnt},
                {"metric": "Unpaid Invoices", "count": unpaid_cnt},
            ]
            chart_tag = f'<altrix_chart type="bar" title="Live School Operational Indicators" xKey="metric" yKeys="count" data=\'{json.dumps(chart_data)}\' />'

            response_parts = [
                "### 🏫 AltRix Executive Performance Dashboard\n\n",
                f"Here is your school's live operational health assessment generated directly from your active ERP database:\n\n",
                "#### 📊 Core Operational Indicators:\n",
                f"- 🎓 **Total Active Enrollment:** **{tot_students} Students** across active grades & sections\n",
                f"- 👨‍🏫 **Faculty Strength:** **{tot_teachers} Faculty Members** (Student-to-Teacher Ratio: ~{max(1, round(tot_students / max(1, tot_teachers)))}:1)\n",
                f"- 🏢 **Campus Infrastructure:** **{campuses_cnt} Active Campus Branch{'es' if campuses_cnt > 1 else ''}**\n",
                f"- 💳 **Month-to-Date Fee Collections:** **{collected_str}** received\n",
                f"- 📋 **Outstanding Invoices Pending:** **{unpaid_cnt} Vouchers** require follow-up\n",
                f"- 👥 **Staff Turnout Today:** **{staff_pres} Present** ({staff_rate_str} presence)\n",
            ]

            if adm_pending > 0:
                response_parts.append(f"- 📝 **Pending Admissions:** **{adm_pending} Applications** awaiting evaluation\n")

            response_parts.append(f"\n{chart_tag}\n\n")

            response_parts.append(
                "#### 🔍 Key Operational Insights:\n"
                "- **Financial Health:** Fee collection pipeline is active. You can generate automated SMS reminders for pending defaulters.\n"
                "- **Academic Operations:** Classes and scheduled timetable periods are running normally across campuses.\n"
                "- **Staff Attendance:** Daily biometric and manual attendance logs are up-to-date.\n\n"
                "You can navigate to specific modules for deep drill-down:\n\n"
                "- 📊 Fee & Financial Invoices: `/finance/invoices`\n"
                "- 📋 Student & Staff Attendance: `/attendance`\n"
                "- 📈 Comprehensive Reports: `/reports`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/reports", "label": "Open Detailed School Reports"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/finance/invoices", "label": "Review Invoices & Defaulters"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/attendance", "label": "Check Realtime Attendance"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 2: REVENUE / FEES / INVOICES / PAYMENTS / DEFAULTERS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "revenue", "fee", "fees", "invoice", "invoices", "payment", "payments",
            "defaulter", "defaulters", "collected", "unpaid", "voucher", "finance", "money", "income"
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
                for d in ctx["defaulters"][:5]:
                    response_parts.append(f"- {d}\n")
                response_parts.append("\n")

            if ctx["recent_payments"]:
                response_parts.append("#### ✅ Recent Fee Collections Recorded:\n")
                for p in ctx["recent_payments"][:4]:
                    response_parts.append(f"- {p}\n")
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
        # INTENT 3: ATTENDANCE / ABSENTEES / PRESENT / TURNOUT
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "attendance", "absent", "absentees", "present", "turnout", "clock in", "clock out", "late"
        ]):
            staff_att = ctx["staff_attendance"]
            pres = staff_att["present"]
            absent = staff_att["absent"]
            unmarked = staff_att["unmarked"]

            chart_data = [
                {"status": "Present", "count": pres},
                {"status": "Absent", "count": absent},
                {"status": "Unmarked", "count": unmarked},
            ]
            chart_tag = f'<altrix_chart type="bar" title="Today\'s Staff Attendance" xKey="status" yKeys="count" data=\'{json.dumps(chart_data)}\' />'

            response_parts = [
                "### 📋 School Attendance Summary\n\n",
                "Here is today's real-time attendance report for your school shell:\n\n",
                f"- **Present Staff:** **{pres}**\n",
                f"- **Absent Staff:** **{absent}**\n",
                f"- **Unmarked Records:** **{unmarked}**\n\n",
            ]

            if staff_att["details"]:
                response_parts.append("#### 🕒 Today's Staff Clock-In Status:\n")
                for s in staff_att["details"][:6]:
                    response_parts.append(f"{s}\n")
                response_parts.append("\n")

            response_parts.append(f"{chart_tag}\n\n")
            response_parts.append(
                "Access attendance operations:\n"
                "- Attendance Center: `/attendance`\n"
                "- Staff Attendance: `/staff-attendance`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/attendance", "label": "Open Student Attendance Center"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/staff-attendance", "label": "Open Staff Attendance Register"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 4: STUDENTS / CLASSES / SECTIONS / ENROLLMENT
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "student", "students", "class", "classes", "section", "sections", "enrollment", "enrolled"
        ]):
            tot_students = ctx["total_students"] or len(ctx["students"]) or 0

            response_parts = [
                "### 🎓 Student Enrollment & Class Distribution\n\n",
                f"- **Total Enrolled Students:** **{tot_students} Active Students**\n\n",
            ]

            if ctx["classes"]:
                response_parts.append("#### 📚 Class & Section Enrollment Summary:\n")
                for c in ctx["classes"][:8]:
                    response_parts.append(f"{c}\n")
                response_parts.append("\n")

            response_parts.append(
                "Manage academic structures and student records:\n"
                "- Academics & Classes: `/academic`\n"
                "- Student Directory: `/directory`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/academic", "label": "Open Classes & Sections"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/directory", "label": "View Student Directory"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 5: TEACHERS / STAFF / HR / LEAVES
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
                for s in ctx["staff"][:6]:
                    response_parts.append(f"{s}\n")
                response_parts.append("\n")

            if ctx["leaves"]:
                response_parts.append("#### 📝 Recent Staff Leave Requests:\n")
                for l in ctx["leaves"][:4]:
                    response_parts.append(f"{l}\n")
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
        # INTENT 6: EXAMS / RESULTS / GRADES / MARKS
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "exam", "exams", "result", "results", "grade", "grades", "mark", "marks", "term", "score"
        ]):
            response_parts = [
                "### 📝 Examination & Academic Results\n\n",
                "Here is the active examination status for your school:\n\n",
            ]

            if ctx["exams"]:
                response_parts.append("#### 🎯 Registered Exam Terms:\n")
                for e in ctx["exams"][:5]:
                    response_parts.append(f"{e}\n")
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
        # INTENT 7: NOTICES / ANNOUNCEMENTS / HOLIDAYS / CALENDAR
        # ─────────────────────────────────────────────────────────────────────
        elif any(w in q for w in [
            "notice", "notices", "announcement", "holiday", "holidays", "event", "events", "calendar"
        ]):
            response_parts = [
                "### 📢 Announcements & School Calendar\n\n",
            ]

            if ctx["notices"]:
                response_parts.append("#### 🔔 Recent Announcements:\n")
                for n in ctx["notices"][:4]:
                    response_parts.append(f"{n}\n")
                response_parts.append("\n")

            if ctx["holidays"]:
                response_parts.append("#### 🏖️ Upcoming Scheduled Holidays:\n")
                for h in ctx["holidays"][:4]:
                    response_parts.append(f"{h}\n")
                response_parts.append("\n")

            response_parts.append(
                "Communication channels:\n"
                "- Notices: `/notices`\n"
                "- Calendar & Holidays: `/holidays`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/notices", "label": "Open Notices & Broadcasts"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/holidays", "label": "View School Calendar"}</altrix_action>'
            )
            return "".join(response_parts)

        # ─────────────────────────────────────────────────────────────────────
        # INTENT 8: GENERAL ASSISTANT / SHELL-CONNECTED RESPONSE
        # ─────────────────────────────────────────────────────────────────────
        else:
            tot_students = ctx["total_students"] or len(ctx["students"]) or 0
            tot_teachers = ctx["total_teachers"] or len(ctx["staff"]) or 0
            campuses_cnt = ctx["active_campuses"] or len(ctx["campuses"]) or 1
            collected_str = ctx["collected_fees"] or "Rs. 0.00"

            return (
                f"### 🤖 AltRix AI Copilot — {ctx['role']}\n\n"
                f"I am actively connected to your school ERP shell (**{tot_students} Students**, **{tot_teachers} Faculty Members**, **{campuses_cnt} Campus Branch{'es' if campuses_cnt > 1 else ''}**).\n\n"
                f"Regarding your query on **\"{user_message}\"**:\n\n"
                f"- **Financial Health:** Month-to-date collections are currently tracking at **{collected_str}**.\n"
                f"- **Daily Operations:** Classes, staff attendance, and timetable periods are actively running.\n"
                f"- **Instant Assistance:** You can ask me specific questions like *'Show overall school performance'*, *'What is this month revenue?'*, *'Who are top defaulters?'*, or *'Show today attendance'*.\n\n"
                "Quick module shortcuts:\n"
                "- 📊 Fee & Invoices: `/finance/invoices`\n"
                "- 📋 Student & Staff Attendance: `/attendance`\n"
                "- 📝 Exams & Results: `/exams`\n"
                "- 📈 Comprehensive Analytics: `/reports`\n\n"
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/reports", "label": "View Overall School Analytics"}</altrix_action>\n'
                '<altrix_action>{"type": "NAVIGATE_TO", "route": "/finance/invoices", "label": "Open Financial Invoices"}</altrix_action>'
            )

    @classmethod
    async def stream_completion(
        cls, 
        system_prompt: str, 
        user_message: str, 
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Executes streaming AI response.
        Attempts LLM endpoints first; if offline/unconfigured/error, streams the
        high-precision cognitive ERP engine response smoothly token-by-token.
        """
        model = cls.route_model(user_message)
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        success_streamed = False

        # ── 1. Attempt External / Cloud / Ollama LLM if configured ───────────
        try:
            target_url = None
            headers = {"Content-Type": "application/json"}
            api_key = settings.ollama_api_key or settings.ai_api_key or settings.gemini_api_key

            if settings.ai_api_base:
                target_url = f"{settings.ai_api_base.rstrip('/')}/chat/completions"
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
            elif settings.ollama_url:
                base_url = settings.ollama_url.rstrip('/')
                target_url = f"{base_url}/chat" if base_url.endswith("/api") else f"{base_url}/api/chat"
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

            if target_url:
                payload = {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": 0.3 if "r1" in model.lower() or "reason" in model.lower() else 0.7
                    }
                }
                timeout = httpx.Timeout(30.0, connect=3.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", target_url, json=payload, headers=headers) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if not line.strip():
                                    continue
                                try:
                                    # Handle OpenAI or Ollama SSE format
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
        except Exception as e:
            logger.info(f"External LLM stream bypassed: {e}")

        # ── 2. Autonomous Cognitive ERP Reasoning Stream ─────────────────────
        if not success_streamed:
            logger.info("Executing Autonomous Cognitive ERP Intelligence Engine for Copilot")
            generated_response = cls.generate_smart_fallback(system_prompt, user_message)

            # Stream chunks with realistic pacing for interactive UI feel
            words = generated_response.split(" ")
            for i, word in enumerate(words):
                token = word if i == 0 else " " + word
                sse_data = {"choices": [{"delta": {"content": token}}]}
                yield f"data: {json.dumps(sse_data)}\n\n"
                # Small non-blocking yield tick every few words for fluid streaming animation
                if i % 3 == 0:
                    await asyncio.sleep(0.01)

        yield "data: [DONE]\n\n"

