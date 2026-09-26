"""
What a parent or a student may read and write through the data proxy.

The proxy confined every caller to their own school and nothing more, so a
parent or a student could read every table in it: every child's marks, fees,
attendance, health and behaviour records, every parent's phone number, the
staff's salaries and contracts, the admission leads. They could also write to
most of them. A family account now sees only its own children's rows (and its
own messages, notifications and settings), the school's public structure (classes,
timetable, calendar, notices meant for it), and nothing else.

Deny by default: a table not described here is not available to a family.

A "family" caller is one whose roles are only parent and/or student. Anyone
with a staff role keeps the school-wide access they had.
"""
from typing import Dict, Optional, Set

from app.utils.permissions import expand_roles

FAMILY_ROLES = frozenset({"parent", "student"})

KIDS = "CAST(:__kids AS uuid[])"
OWN_CHILD = f"student_id = ANY({KIDS})"
STAFF_USERS = (
    "(SELECT ur.user_id FROM public.user_roles ur WHERE ur.school_id = :__fam_school"
    " AND ur.role::text NOT IN ('parent', 'student'))"
)
CHILD_GUARDIANS = f"(SELECT g.user_id FROM public.student_guardians g WHERE g.student_id = ANY({KIDS}))"
CHILD_ACCOUNTS = f"(SELECT s.profile_id FROM public.students s WHERE s.id = ANY({KIDS}) AND s.profile_id IS NOT NULL)"
VISIBLE_MESSAGES = (
    "(SELECT m.id FROM public.admin_messages m WHERE m.sender_user_id = :__me"
    " UNION SELECT r.message_id FROM public.admin_message_recipients r WHERE r.recipient_user_id = :__me)"
)
VISIBLE_COMPLAINTS = (
    f"(SELECT c.id FROM public.complaints c WHERE c.sender_user_id = :__me OR c.student_id = ANY({KIDS}))"
)
VISIBLE_CONVERSATIONS = (
    f"(SELECT sc.id FROM public.support_conversations sc WHERE sc.user_id = :__me OR sc.student_id = ANY({KIDS}))"
)

#: The school's own structure and calendar: no one's personal record.
SCHOOL_WIDE: Set[str] = {
    "academic_classes", "class_sections", "class_section_subjects", "section_subjects", "subjects",
    "timetable_entries", "timetable_periods", "teacher_assignments", "teacher_subject_assignments",
    "teacher_period_presence", "holidays", "diary_entries", "homework", "assignments",
    "academic_assessments", "attendance_sessions", "exams", "exam_subjects", "grade_thresholds",
    "report_card_settings", "school_branding", "library_books", "vehicles", "fee_settings",
    "finance_payment_methods", "schools", "system_settings",
}

#: Rows a family may read, for tables that are neither school-wide nor keyed
#: by student_id alone. (Any other table with a student_id column is limited
#: to the family's own children.)
READ_RULES: Dict[str, str] = {
    "students": f"id = ANY({KIDS})",
    # Notices for everyone, or for parents / students: not staff circulars.
    "notices": "audience = ANY(CAST(:__aud AS text[]))",
    "exam_datesheet_distributions": f"(student_id IS NULL OR {OWN_CHILD})",
    "exam_result_publications": f"(student_id IS NULL OR {OWN_CHILD})",
    "fee_invoice_items": f"invoice_id IN (SELECT i.id FROM public.fee_invoices i WHERE i.student_id = ANY({KIDS}))",
    "complaints": f"(sender_user_id = :__me OR {OWN_CHILD})",
    "complaint_feedbacks": f"complaint_id IN {VISIBLE_COMPLAINTS}",
    "parent_messages": "(sender_user_id = :__me OR recipient_user_id = :__me)",
    "support_conversations": f"(user_id = :__me OR {OWN_CHILD})",
    "support_messages": f"conversation_id IN {VISIBLE_CONVERSATIONS}",
    "admin_messages": f"id IN {VISIBLE_MESSAGES}",
    "admin_message_recipients": (
        "(recipient_user_id = :__me OR message_id IN"
        " (SELECT m.id FROM public.admin_messages m WHERE m.sender_user_id = :__me))"
    ),
    "admin_message_pins": f"message_id IN {VISIBLE_MESSAGES}",
    "admin_message_reactions": f"message_id IN {VISIBLE_MESSAGES}",
    "scheduled_messages": "sender_user_id = :__me",
    "app_notifications": "user_id = :__me",
    "cleared_conversations": "user_id = :__me",
    "user_notification_preferences": "user_id = :__me",
    "user_web_push_subscriptions": "user_id = :__me",
    "parent_notification_preferences": "user_id = :__me",
    "school_memberships": "user_id = :__me",
    "platform_super_admins": "user_id = :__me",
    # The people a family deals with: the school's staff, their own
    # children's accounts and guardians. Not every other family.
    "user_roles": "(user_id = :__me OR role::text NOT IN ('parent', 'student'))",
    "school_user_directory": (
        f"(user_id = :__me OR user_id IN {STAFF_USERS} OR user_id IN {CHILD_GUARDIANS}"
        f" OR user_id IN {CHILD_ACCOUNTS})"
    ),
    "profiles": (
        f"(id = :__me OR id IN {STAFF_USERS} OR id IN {CHILD_GUARDIANS} OR id IN {CHILD_ACCOUNTS})"
    ),
}

#: What a family may write. For each table: the actions allowed, the rows an
#: update or delete may touch, the columns always set to the caller, and
#: whether a written student_id must be the family's own child.
class WriteRule:
    def __init__(self, actions: Set[str], scope: str, owner_cols=(), child=False, insert_check: Optional[str] = None,
                 protected_cols=(), allowed_status=None):
        self.actions = actions
        self.scope = scope
        self.owner_cols = tuple(owner_cols)
        self.child = child
        self.insert_check = insert_check
        # Columns a family may never set (marks are the teacher's), and the
        # statuses it may write.
        self.protected_cols = tuple(protected_cols)
        self.allowed_status = allowed_status


WRITE_RULES: Dict[str, WriteRule] = {
    "admin_messages": WriteRule({"insert", "update", "delete"}, "sender_user_id = :__me", ["sender_user_id"]),
    "admin_message_recipients": WriteRule(
        {"insert", "update", "delete"}, "recipient_user_id = :__me OR message_id IN"
        " (SELECT m.id FROM public.admin_messages m WHERE m.sender_user_id = :__me)",
        insert_check="EXISTS (SELECT 1 FROM public.admin_messages m WHERE m.id = CAST(:__v_message_id AS uuid)"
                     " AND m.sender_user_id = :__me)"),
    "admin_message_pins": WriteRule({"insert", "delete"}, "user_id = :__me", ["user_id"]),
    "admin_message_reactions": WriteRule({"insert", "delete"}, "user_id = :__me", ["user_id"]),
    "scheduled_messages": WriteRule({"insert", "update", "delete"}, "sender_user_id = :__me", ["sender_user_id"]),
    "cleared_conversations": WriteRule({"insert", "upsert", "update", "delete"}, "user_id = :__me", ["user_id"]),
    # A notification for oneself, or for a member of staff or a guardian of
    # one's own child (a complaint or a message tells the other side).
    "app_notifications": WriteRule(
        {"insert", "update", "delete"}, "user_id = :__me",
        insert_check=f"(CAST(:__v_user_id AS uuid) = :__me OR CAST(:__v_user_id AS uuid) IN {STAFF_USERS}"
                     f" OR CAST(:__v_user_id AS uuid) IN {CHILD_GUARDIANS})"),
    "user_notification_preferences": WriteRule({"insert", "upsert", "update"}, "user_id = :__me", ["user_id"]),
    "user_web_push_subscriptions": WriteRule({"insert", "upsert", "update", "delete"}, "user_id = :__me", ["user_id"]),
    "parent_notification_preferences": WriteRule(
        {"insert", "upsert", "update"}, "user_id = :__me", ["user_id"], child=True),
    "parent_messages": WriteRule(
        {"insert", "update"}, "(sender_user_id = :__me OR recipient_user_id = :__me)", ["sender_user_id"],
        child=True),
    "complaints": WriteRule({"insert", "update"}, "sender_user_id = :__me", ["sender_user_id"], child=True),
    "complaint_feedbacks": WriteRule(
        {"insert"}, "author_user_id = :__me", ["author_user_id"],
        insert_check=f"CAST(:__v_complaint_id AS uuid) IN {VISIBLE_COMPLAINTS}"),
    "support_conversations": WriteRule({"insert", "update"}, "user_id = :__me", ["user_id"], child=True),
    "support_messages": WriteRule(
        {"insert"}, "sender_user_id = :__me", ["sender_user_id"],
        insert_check=f"CAST(:__v_conversation_id AS uuid) IN {VISIBLE_CONVERSATIONS}"),
    # A student hands work in; the teacher (or the server, for a quiz) marks
    # it. The browser used to grade quizzes and write the marks itself.
    "assignment_submissions": WriteRule(
        {"insert", "update"}, f"{OWN_CHILD} AND status IS DISTINCT FROM 'graded'", child=True,
        protected_cols=("marks", "marks_obtained", "feedback", "graded_at", "graded_by",
                        "marks_before_penalty", "penalty_applied"),
        allowed_status={"draft", "submitted", "late"}),
    "fee_payment_proofs": WriteRule({"insert", "update"}, OWN_CHILD, child=True),
    "parent_behavior_notes": WriteRule({"insert", "delete"}, "parent_user_id = :__me", ["parent_user_id"], child=True),
    "ai_counseling_queue": WriteRule({"insert"}, OWN_CHILD, child=True),
}


def is_family_caller(user) -> bool:
    """True when the caller holds no role but parent and/or student."""
    if getattr(user, "is_super_admin", False):
        return False
    roles = set(expand_roles(list(getattr(user, "roles", None) or [])))
    return not (roles - FAMILY_ROLES)


def read_rule(table: str, columns: Set[str]) -> Optional[str]:
    """
    The WHERE condition limiting a family's read of ``table``; "" for a
    school-wide table; None when the table is not available to a family.
    """
    t = table.lower()
    if t in READ_RULES:
        return READ_RULES[t]
    if t in SCHOOL_WIDE:
        return ""
    if "student_id" in columns:
        return OWN_CHILD
    return None


def notice_audiences(user) -> list:
    roles = set(expand_roles(list(getattr(user, "roles", None) or [])))
    out = ["all"]
    if "parent" in roles:
        out.append("parents")
    if "student" in roles:
        out.append("students")
    return out


#: Database functions a family may call. The rest work across the school
#: (at-risk students with their grades, the whole user directory with
#: emails, finding any parent by email, issuing invoices) and are for staff.
FAMILY_RPC: Set[str] = {
    "my_children_detailed", "my_student_id", "get_child_teachers_detailed", "search_messages",
    "get_school_public_by_slug", "get_school_staff_directory", "has_role",
    "can_edit_attendance", "can_manage_finance", "can_manage_staff", "can_manage_students", "can_work_crm",
}

#: Asked for by family screens, answered with what a family may see: the
#: people they message are the school's staff, not every user's email.
FAMILY_RPC_SUBSTITUTE: Dict[str, str] = {
    "get_school_user_directory": "get_school_staff_directory",
}


_OWNER_COLUMNS = ("user_id", "recipient_user_id", "sender_user_id", "author_user_id", "parent_user_id")
_NULL_STUDENT_IS_PUBLIC = {"exam_datesheet_distributions", "exam_result_publications"}


def row_visible(table: str, row: dict, me: str, kids: Set[str], audiences=("all", "parents", "students")) -> bool:
    """
    Whether a changed row may be pushed live to a family member: the read
    rules above, judged from the row itself. A row that cannot be judged from
    its own columns (a reply in a support thread, say) is not pushed; the
    family is told only that the table changed, and their screen reads it
    again through the proxy, which applies the full rules.
    """
    if not isinstance(row, dict):
        return False
    t = table.lower()
    if t in SCHOOL_WIDE:
        return True
    if t == "notices":
        return row.get("audience") in audiences
    if t == "students":
        return str(row.get("id")) in kids
    if any(row.get(c) is not None and str(row.get(c)) == me for c in _OWNER_COLUMNS):
        return True
    if "student_id" in row:
        sid = row.get("student_id")
        return t in _NULL_STUDENT_IS_PUBLIC if sid is None else str(sid) in kids
    return False



def redact_rows(rows):
    """Quiz answer keys out of everything a family reads (see app/utils/quiz.py)."""
    from app.utils import quiz

    def walk(v):
        if isinstance(v, dict):
            for k, x in list(v.items()):
                if k == "description" and isinstance(x, str):
                    v[k] = quiz.student_view(x)
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(rows)
    return rows
