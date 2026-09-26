"""
Teacher and student analysis: measured from the records, never invented.

The Supabase versions sent a few counts to a paid AI gateway (gone) and stored
the scores it made up, including a "feedback sentiment" with no feedback
collected and a student's personality from their marks.
"""
import inspect

from app.routers import functions as f


def test_risk_is_the_worst_stated_risk():
    assert f.student_risk(None, None, 0) is None          # no records, no score
    assert f.student_risk(95, 80, 0) == 0
    assert f.student_risk(50, None, 0) == 100             # attendance at 50%
    assert f.student_risk(None, 20, 0) == 100             # marks at 20%
    assert f.student_risk(80, 30, 1) == 75                # marks the worst of the three
    assert f.student_risk(None, None, 3) == 60            # conduct only


def test_nothing_is_guessed():
    teacher = inspect.getsource(f.ai_teacher_analyzer)
    student = inspect.getsource(f.ai_student_analyzer)
    assert "engagement_score = NULL" in teacher            # not measured, not invented
    assert "feedback_sentiment" not in teacher
    assert "learning_style = NULL" in student and "personality_type = NULL" in student
    for src in (teacher, student):
        assert "ai.gateway" not in src and "LOVABLE" not in src


def test_routes_sit_before_the_catch_all():
    paths = [r.path for r in f.router.routes]
    for name in ("ai-teacher-analyzer", "ai-student-analyzer", "ai-early-warning"):
        assert paths.index(f"/functions/{name}") < paths.index("/functions/{function_name}")


def test_only_staff_and_own_school():
    src = inspect.getsource(f._staff_school)
    assert "That is not your school." in src and "Only staff can do this." in src
    assert "You can analyse only your own teaching." in inspect.getsource(f.ai_teacher_analyzer)
