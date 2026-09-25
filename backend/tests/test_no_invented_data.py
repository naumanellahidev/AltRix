# -*- coding: utf-8 -*-
"""
Nothing on a screen is made up.

A sweep found screens that invented what they showed:
- the platform health page (CPU "4.8%", a random latency, "1,420 students");
- the database page ("114.6 MB", a fake "93.1 MB" backup, "John Doe" put
  into an empty school's export, which a restore would have written back);
- the platform search (made-up people when nothing matched);
- a principal's radar ("SIMULATE LIVE CHECK-IN" added invented staff to the
  Active Staff count);
- complaint forms ("Add mock file" attached files that never existed);
- a timetable draft that "approved" without saving;
- a report card and a visitor pass headed "ALTRIX ACADEMY" for every school.

These tests keep those patterns out.
"""
import io
import re

import pytest

SRC = "../src/"


def read(path: str) -> str:
    return io.open(SRC + path, encoding="utf-8").read()


@pytest.mark.parametrize("path,forbidden", [
    ("pages/platform/PlatformHealthPage.tsx", ['cpuUsage: "4.8%"', "Math.random()", '"94.2%"', "rows: 1420"]),
    ("pages/platform/PlatformDashboardPage.tsx", ["mockData", "Dr. Kamran Malik"]),
    ("pages/platform/PlatformDatabasePage.tsx", ['size: "93.1 MB"', ">114.6 MB<", 'first_name: "John"',
                                                 'first_name: "Automated"', "const TABLES: DbTable[]",
                                                 '"Re-indexed 4 indexes']),
    ("components/principal/AttendanceHeatmap.tsx", ["SIMULATE LIVE CHECK-IN", "simulateCheckIn"]),
    ("pages/tenant/student-modules/StudentComplaintsModule.tsx", ["addMockAttachment", "Add mock file"]),
    ("pages/tenant/teacher-modules/TeacherComplaintsModule.tsx", ["addMockAttachment", "Add mock file"]),
    ("components/ai/SmartTimetableGenerator.tsx", ["mock: true", "mockSuggestion"]),
    ("pages/tenant/parent-modules/ParentReportCardModule.tsx", [">ALTRIX ACADEMY<"]),
    ("pages/tenant/parent-modules/ParentVisitorModule.tsx", [">ALTRIX ACADEMY<"]),
])
def test_no_screen_invents_what_it_shows(path, forbidden):
    # Comments may describe what used to be there; only the code is checked.
    body = re.sub(r"/\*.*?\*/", "", read(path), flags=re.S)
    body = re.sub(r"(?m)^\s*//.*$|\{/\*.*?\*/\}", "", body)
    for pattern in forbidden:
        assert pattern not in body, f"{path}: {pattern!r}"


def test_the_health_pages_read_the_server():
    assert "/platform/health-metrics" in read("pages/platform/PlatformHealthPage.tsx")
    assert "/platform/health-metrics" in read("pages/platform/PlatformDatabasePage.tsx")
    router = io.open("app/routers/platform_health.py", encoding="utf-8").read()
    assert router.count("if not current_user.is_super_admin:") == 2  # both endpoints, owner only
    assert "pg_stat_activity" in router and "/proc/meminfo" in router
    main = io.open("app/main.py", encoding="utf-8").read()
    assert "platform_health_router" in main


def test_the_database_page_runs_real_operations():
    page = read("pages/platform/PlatformDatabasePage.tsx")
    assert '"/super_admin/backups/run"' in page
    assert '"/platform/maintenance/analyze"' in page


def test_complaint_attachments_are_real_files():
    comp = read("components/complaints/ComplaintAttachments.tsx")
    assert "api.storage.from(COMPLAINT_BUCKET).upload(" in comp
    assert "createSignedUrl(" in comp
    for path in ("pages/tenant/student-modules/StudentComplaintsModule.tsx",
                 "pages/tenant/teacher-modules/TeacherComplaintsModule.tsx"):
        assert "<ComplaintAttachmentPicker" in read(path)


def test_a_timetable_draft_is_saved_before_it_can_be_approved():
    body = read("components/ai/SmartTimetableGenerator.tsx")
    assert '.from("ai_timetable_suggestions")\n          .insert(' in body.replace("\r\n", "\n")
    assert "cannot be approved" in body
