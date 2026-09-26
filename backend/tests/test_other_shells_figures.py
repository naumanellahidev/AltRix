"""
Figures on the accountant, HR, owner and principal screens that were wrong,
found by opening every screen of those shells.
"""
import io
import re


def _src(path: str) -> str:
    return io.open(path, encoding="utf-8").read()


def test_the_roll_counts_enrolled_students():
    # "enrolled" students were left off the roll: a school of nine showed one.
    src = _src("app/routers/owner_insights.py")
    assert "COALESCE(status, 'active') = 'active'" not in src
    assert "status NOT IN ('inactive', 'withdrawn', 'graduated', 'deleted')" in src


def test_dashboard_kpis_count_money_in_the_month_it_moved():
    src = _src("app/routers/misc.py")
    # A payment belongs to the month it was paid, not the month it was typed in.
    assert "paid_at >= :mtd_start OR created_at >= :mtd_start" not in src
    assert "COALESCE(paid_at, created_at) >= :mtd_start" in src
    assert "expense_date >= :mtd_date OR created_at >= :mtd_start" not in src
    # Won and lost leads are not open.
    assert "status = 'open' OR stage_id IS NOT NULL" not in src
    # The school's month, not the server's.
    assert 'datetime.now(ZoneInfo("Asia/Karachi"))' in src
    # A person with two roles is one member of staff.
    assert re.search(r"COUNT\(DISTINCT user_id\) FROM user_roles WHERE school_id = :sid AND role IN", src)


def test_salary_lists_for_the_copilot_say_which_are_inactive():
    src = _src("app/utils/ai_context_builder.py")
    assert "CASE WHEN COALESCE(sr.is_active, true) THEN 'active' ELSE 'inactive' END AS status" in src


def test_tax_settings_and_campus_staff_are_reachable_and_scoped():
    from app.utils import db_proxy_policy as pol
    assert "finance_tax_settings" in pol.FINANCE_TABLES  # never written by families
    assert "staff_campus_assignments" in pol.GLOBAL_READABLE
    vps = _src("app/routers/vps_db.py")
    assert '"staff_campus_assignments": ("campus_id", "campuses")' in vps


def test_migrations_for_this_round_exist_and_are_idempotent():
    for name in ("20261031001000_finance_tax_settings.sql",
                 "20261031001100_datesheet_notifications_once.sql",
                 "20261031001200_owner_assignments_follow_accounts.sql"):
        sql = _src(f"sql_migrations/{name}")
        assert "BEGIN;" in sql and "COMMIT;" in sql
        assert "Idempotent" in sql
    once = _src("sql_migrations/20261031001100_datesheet_notifications_once.sql")
    assert once.count("WHERE NOT EXISTS") == 3  # parents, teachers, administrators
