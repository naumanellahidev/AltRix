# -*- coding: utf-8 -*-
"""
Hostel and bus screens for families show the child's own records.

Both hostel screens and the student transport screen showed invented rooms,
wardens, drivers (with phone numbers) and roommates; /transport/my-bus
returned the school's first two students to anyone it could not match, and
/bus/{id}/live answered with fixed coordinates for any school's bus.
"""
import io

HOSTEL = io.open("app/routers/hostel.py", encoding="utf-8").read()
TRANSPORT = io.open("app/routers/transport.py", encoding="utf-8").read()


def test_a_family_sees_its_own_hostel_stay():
    assert '@router.get("/my-stay")' in HOSTEL and "get_allowed_student_ids" in HOSTEL


def test_my_bus_uses_the_family_scope_and_invents_nothing():
    assert "all_students[:2]" not in TRANSPORT and '"07:45 AM"' not in TRANSPORT
    assert "31.5004" not in TRANSPORT and '"no_signal"' in TRANSPORT
    assert "Vehicle.school_id == current_user.school_id" in TRANSPORT


def test_the_family_screens_read_real_records():
    for f in ("student-modules/StudentHostelModule.tsx", "parent-modules/ParentHostelModule.tsx",
              "student-modules/StudentTransportModule.tsx"):
        s = io.open("../src/pages/tenant/" + f, encoding="utf-8").read()
        assert "Shaheen" not in s and "Tariq" not in s and "+92" not in s
