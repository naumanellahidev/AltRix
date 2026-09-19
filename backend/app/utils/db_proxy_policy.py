"""
Authorization policy for the generic database proxy (/api/vps-db).

The proxy lets the frontend issue arbitrary table reads and writes, which makes
it the widest attack surface in the product. Without a policy any authenticated
user -- including a student or a parent -- can escalate to platform super admin,
read password-reset tokens, or wipe a table.

Every proxy request is evaluated here before any SQL is built.

Categories
----------
BLOCKED_TABLES          never reachable through the proxy, for anybody
GLOBAL_READABLE         tables without ``school_id`` that members may read
ROLE_MANAGEMENT_TABLES  writing these grants privileges -> governance roles only
SCHOOL_CONFIG_TABLES    tenant-wide configuration -> governance roles only
FINANCE_TABLES          money and grades -> staff only, never students/parents

Any table without a ``school_id`` column is writable by super admins only:
tenant filtering cannot be applied to it, so a tenant write would be unbounded.
"""
from typing import Optional, Set

from fastapi import HTTPException, status

# --- Roles -------------------------------------------------------------------

#: Roles allowed to grant/revoke roles and change tenant-wide configuration.
GOVERNANCE_ROLES: Set[str] = {
    "super_admin", "school_owner", "principal", "vice_principal", "school_admin",
}

#: Roles that may never write finance, payroll or result data.
NON_STAFF_ROLES: Set[str] = {"student", "parent"}

#: Role values that may never be assigned through the proxy by a non super admin.
PROTECTED_ROLE_VALUES: Set[str] = {"super_admin", "school_owner"}

WRITE_ACTIONS = ("insert", "update", "delete", "upsert")


# --- Table classification ----------------------------------------------------

#: Authentication, session and secret material. Reachable only through the
#: purpose-built routers that apply their own checks -- never through the proxy.
BLOCKED_TABLES: Set[str] = {
    # credential / session material
    "password_resets", "token_blacklist", "active_sessions",
    "failed_login_attempts", "refresh_tokens", "sessions", "identities",
    "mfa_factors", "mfa_challenges", "one_time_tokens", "flow_state",
    "staff_invitations", "invitations",
    # supabase auth mirrors that may live in public
    "users", "auth_users",
    # security / platform operations
    "security_events", "ip_banlist", "audit_log",
    # outbound email configuration (spoofing / phishing surface)
    "email_sender_identities", "email_branding_config", "email_assets",
    "email_templates", "email_template_versions", "email_event_mappings",
    "email_logs",
    # internal machinery
    "ai_semantic_cache", "ai_cache_stats", "event_store",
    "event_subscribers_log", "alembic_version",
}

#: Tables with no ``school_id`` that any authenticated member may read.
#: Everything else without a ``school_id`` is super-admin only.
GLOBAL_READABLE: Set[str] = {
    "schools", "profiles", "platform_super_admins", "platform_billing_plans",
    "system_settings", "school_bootstrap", "bus_stops",
    "report_card_subject_entries", "co_curricular_grades",
    "exam_seat_assignments", "exam_invigilators", "admin_message_recipients",
    "activity_timeline",
}

#: Writing any of these changes who can do what. Governance roles only.
ROLE_MANAGEMENT_TABLES: Set[str] = {
    "user_roles", "school_owner_assignments", "school_memberships",
    "staff_campus_assignments", "platform_super_admins",
    "owner_active_context", "school_user_directory",
}

#: Tenant-wide configuration: branding, feature entitlements, payment gateway
#: credentials, grading scales. Governance roles only.
SCHOOL_CONFIG_TABLES: Set[str] = {
    "schools", "school_branding", "school_feature_flags", "system_settings",
    "school_alert_settings", "school_id_card_settings",
    "school_inquiry_settings", "fee_settings", "jazzcash_settings",
    "easypaisa_settings", "grade_thresholds", "white_label_settings",
    "custom_domains", "platform_invoices", "platform_requests", "campuses",
}

#: Money and academic results. Students and parents may never write these.
FINANCE_TABLES: Set[str] = {
    "fee_payments", "fee_invoices", "fee_invoice_items", "fee_plans",
    "fee_plan_items", "fee_vouchers", "fee_voucher_batches",
    "fee_voucher_deliveries", "fee_payment_proofs", "fee_reminders",
    "student_fee_assignments", "student_fee_ledger", "finance_expenses",
    "finance_invoices", "finance_payments", "finance_payment_methods",
    "jazzcash_transactions", "salary_budget_targets", "hr_payslips",
    "hr_pay_runs", "hr_payroll_runs", "hr_salary_records",
    "hr_salary_components", "hr_employee_salary_structure", "hr_contracts",
    "exam_results", "student_marks", "student_results", "report_cards",
}


# --- Entry point -------------------------------------------------------------

def _deny(reason: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)


def authorize_proxy_request(
    *,
    table: str,
    action: str,
    roles: Set[str],
    is_super_admin: bool,
    has_school_id: bool,
    has_user_filter: bool,
    payload_roles: Optional[Set[str]] = None,
) -> None:
    """
    Raise ``HTTPException`` unless this proxy request is permitted.

    ``has_school_id``    the target table carries a ``school_id`` column, so the
                         proxy can confine the statement to the caller's tenant.
    ``has_user_filter``  the caller supplied at least one WHERE condition of
                         their own. Required for update/delete so a missing
                         filter cannot become a whole-table mutation.
    ``payload_roles``    role values the caller is trying to write, when the
                         target is a role-management table.
    """
    table = (table or "").strip().lower()
    action = (action or "select").strip().lower()
    is_write = action in WRITE_ACTIONS

    # 1. Hard denials apply to everyone, super admins included. These tables are
    #    served by dedicated routers that enforce their own rules.
    if table in BLOCKED_TABLES:
        raise _deny(
            f"Table '{table}' is not accessible through the data proxy. "
            "Use the dedicated API endpoint for this resource."
        )

    if is_super_admin:
        if action in ("update", "delete") and not has_user_filter:
            raise _deny(
                f"Refusing an unfiltered {action} on '{table}'. "
                "Supply at least one filter."
            )
        return

    # 2. Tables with no school_id cannot be confined to the caller's tenant.
    if not has_school_id:
        if is_write:
            raise _deny(
                f"Table '{table}' is not tenant-scoped and cannot be modified "
                "through the data proxy."
            )
        if table not in GLOBAL_READABLE:
            raise _deny(
                f"Table '{table}' is not tenant-scoped and cannot be read "
                "through the data proxy."
            )
        return

    # 3. Without a caller-supplied filter an update/delete covers the whole
    #    school, so refuse it outright.
    if action in ("update", "delete") and not has_user_filter:
        raise _deny(
            f"Refusing an unfiltered {action} on '{table}'. "
            "Supply at least one filter."
        )

    if not is_write:
        return

    # 4. Privilege-granting writes.
    if table in ROLE_MANAGEMENT_TABLES:
        if not roles & GOVERNANCE_ROLES:
            raise _deny(f"Managing '{table}' requires an administrative role.")
        for value in (payload_roles or set()):
            if value in PROTECTED_ROLE_VALUES and "super_admin" not in roles:
                raise _deny(
                    f"The '{value}' role cannot be assigned through the data proxy."
                )

    # 5. Tenant-wide configuration writes.
    if table in SCHOOL_CONFIG_TABLES and not roles & GOVERNANCE_ROLES:
        raise _deny(f"Changing '{table}' requires an administrative role.")

    # 6. Money and results are staff-only.
    if table in FINANCE_TABLES and roles and not (roles - NON_STAFF_ROLES):
        raise _deny(f"Students and parents cannot modify '{table}'.")
