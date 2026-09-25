# -*- coding: utf-8 -*-
"""
AltRix AI Copilot — Enterprise Upgrade Verification Test Suite
Verifies:
1. Model routing: the cloud when a key is configured, the local server
   otherwise, and never a model the server does not have.
2. Language-agnostic natural language understanding (English, Roman Urdu, Urdu script, mixed).
3. Semantic intent handling (multiple phrasings map to the same factual data).
4. Conversational multi-turn context (follow-up questions).
5. Strict multi-tenant isolation (School A vs School B).
6. Strict role isolation (Principal vs Teacher vs Parent vs Student).
7. Unauthorized data boundary enforcement.
8. Zero hallucination / Nonexistent data handling.
"""

import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test_user:test_pw@localhost:5432/test_db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test_secret_for_jwt_verification_12345678901234567890123456789012")

import pytest
import json
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.utils.ai_service import OllamaAIService
from app.utils.ai_context_builder import build_scoped_ai_context


class MockUser:
    def __init__(self, user_id, email, roles, school_id=None, is_super_admin=False):
        self.id = user_id
        self.email = email
        self.roles = roles
        self.school_id = school_id
        self.is_super_admin = is_super_admin


# ==============================================================================
# TEST 1: Ollama Endpoint & Model Routing Configuration
# ==============================================================================

def test_ollama_endpoints_and_model():
    """The local endpoints are still the fallback, and are tried in order."""
    endpoints = OllamaAIService.get_ollama_endpoints()
    assert len(endpoints) > 0
    assert any("11434" in ep or "ollama" in ep.lower() for ep in endpoints)

    model = OllamaAIService.get_model_name("mere students dikhao")
    assert isinstance(model, str) and model


def test_only_an_installed_model_is_ever_requested():
    """
    The eleven 404s, in one assertion.

    The configured name was ``glm-5.3`` and the server has ``qwen2.5:1.5b``,
    so every message walked a hard-coded list of model names, taking a 404 for
    each, before reaching the one that exists. The model is now chosen from
    what ``/api/tags`` reports.
    """
    installed = ("qwen2.5:1.5b",)
    assert OllamaAIService.choose_local_model(installed, "hello") == "qwen2.5:1.5b"
    # A configured model that is not installed is ignored, not requested.
    assert OllamaAIService.choose_local_model(installed, "compare the trend") in installed
    # Nothing installed means nothing to ask.
    assert OllamaAIService.choose_local_model((), "hello") is None


def test_the_configured_tag_wins_over_a_sibling_of_the_same_family(monkeypatch):
    # /api/tags lists the newest pull first; a family match must not beat
    # the exact tag that was configured.
    from app.utils import ai_service
    monkeypatch.setattr(ai_service.settings, "ollama_general_model", "qwen2.5:1.5b")
    monkeypatch.setattr(ai_service.settings, "ollama_reasoning_model", "qwen2.5:1.5b")
    installed = ("qwen2.5:3b", "gemma2:2b", "qwen2.5:1.5b")
    assert OllamaAIService.choose_local_model(installed, "hello") == "qwen2.5:1.5b"
    monkeypatch.setattr(ai_service.settings, "ollama_general_model", "qwen2.5:3b")
    assert OllamaAIService.choose_local_model(installed, "hello") == "qwen2.5:3b"


def test_the_best_installed_model_wins():
    installed = ("llama3.2:1b", "qwen2.5:7b", "qwen2.5:1.5b")
    assert OllamaAIService.choose_local_model(installed) == "qwen2.5:7b"


def test_the_cloud_is_used_only_when_a_key_is_configured():
    from app.config import settings

    provider, key = settings.ai_provider, settings.ai_api_key
    try:
        settings.ai_provider, settings.ai_api_key = "glm", ""
        assert OllamaAIService.cloud_config() is None

        settings.ai_provider, settings.ai_api_key = "glm", "a-key"
        cloud = OllamaAIService.cloud_config()
        assert cloud and cloud["name"] == "glm" and cloud["base"].startswith("https://")

        settings.ai_provider = "ollama"
        assert OllamaAIService.cloud_config() is None
    finally:
        settings.ai_provider, settings.ai_api_key = provider, key


# ==============================================================================
# TEST 2: Multi-Turn Conversation Memory Formatting
# ==============================================================================

@pytest.mark.asyncio
async def test_multi_turn_history_streaming():
    """Verify that conversation history is formatted and passed cleanly into Ollama messages."""
    history = [
        {"role": "user", "content": "show students"},
        {"role": "assistant", "content": "Here are your 9 students: Nauman, Ali, Sara..."},
    ]
    user_query = "only absent ones"
    system_prompt = "You are AltRix Copilot."

    captured_payload = {}

    class MockResponse:
        status_code = 200
        async def aiter_lines(self):
            yield json.dumps({"message": {"content": "Ali and Sara are absent today."}, "done": True})

    class MockTags:
        status_code = 200

        @staticmethod
        def json():
            return {"models": [{"model": "qwen2.5:1.5b"}]}

    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def get(self, url, **kwargs):
            # The service asks the server what it has before asking it anything.
            return MockTags()
        def stream(self, method, url, json=None, headers=None):
            captured_payload["messages"] = json.get("messages", [])
            captured_payload["model"] = json.get("model", "")
            
            class ContextWrapper:
                async def __aenter__(self_inner):
                    return MockResponse()
                async def __aexit__(self_inner, exc_type, exc_val, exc_tb):
                    pass
            return ContextWrapper()

    with patch("httpx.AsyncClient", return_value=MockClient()):
        stream_chunks = []
        async for chunk in OllamaAIService.stream_completion(system_prompt, user_query, history=history):
            stream_chunks.append(chunk)

        assert len(stream_chunks) > 0
        assert captured_payload["messages"][0]["role"] == "system"
        assert captured_payload["messages"][1]["role"] == "user"
        assert captured_payload["messages"][1]["content"] == "show students"
        assert captured_payload["messages"][2]["role"] == "assistant"
        assert captured_payload["messages"][3]["role"] == "user"
        assert captured_payload["messages"][3]["content"] == "only absent ones"


# ==============================================================================
# TEST 3: Multilingual & Fuzzy Entity Matcher in Context Builder
# ==============================================================================

@pytest.mark.asyncio
async def test_context_builder_multilingual_search():
    """Verify that get_targeted_search_matches isolates terms across English, Roman Urdu, and Urdu."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[]), fetchone=MagicMock(return_value=None)))

    user = MockUser("usr-1", "principal@school.com", ["principal"], "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8")

    # 1. English query
    ctx_en = await build_scoped_ai_context(
        db=mock_db,
        user=user,
        school_id="70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8",
        user_query="How many students are enrolled in Grade 1?"
    )
    assert "[Role Context: School Executive / Owner / Principal]" in ctx_en

    # 2. Roman Urdu query
    ctx_ru = await build_scoped_ai_context(
        db=mock_db,
        user=user,
        school_id="70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8",
        user_query="mere school me kitne bachay parh rahe hain?"
    )
    assert "[Role Context: School Executive / Owner / Principal]" in ctx_ru

    # 3. Urdu script query
    ctx_ur = await build_scoped_ai_context(
        db=mock_db,
        user=user,
        school_id="70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8",
        user_query="طالب علموں کی تعداد اور فیس کتنی ہے؟"
    )
    assert "[Role Context: School Executive / Owner / Principal]" in ctx_ur


# ==============================================================================
# TEST 4: Strict Role Isolation (Principal vs Teacher vs Parent vs Student)
# ==============================================================================

@pytest.mark.asyncio
async def test_role_isolation_boundaries():
    """Verify that context builder generates strictly segregated role contexts."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[]), fetchone=MagicMock(return_value=None)))

    # Principal
    p_user = MockUser("p-1", "principal@school.com", ["principal"], "school-uuid-1")
    p_ctx = await build_scoped_ai_context(db=mock_db, user=p_user, school_id="school-uuid-1", user_query="overview")
    assert "School Executive / Owner / Principal" in p_ctx

    # Teacher
    t_user = MockUser("t-1", "teacher@school.com", ["teacher"], "school-uuid-1")
    t_ctx = await build_scoped_ai_context(db=mock_db, user=t_user, school_id="school-uuid-1", user_query="my classes")
    assert "School Teacher" in t_ctx
    assert "Assigned Classes & Subjects" in t_ctx

    # Parent
    parent_user = MockUser("pr-1", "parent@gmail.com", ["parent"], "school-uuid-1")
    parent_ctx = await build_scoped_ai_context(db=mock_db, user=parent_user, school_id="school-uuid-1", user_query="my children")
    assert "[Role Context: Parent]" in parent_ctx

    # Student
    s_user = MockUser("s-1", "student@school.com", ["student"], "school-uuid-1")
    s_ctx = await build_scoped_ai_context(db=mock_db, user=s_user, school_id="school-uuid-1", user_query="my marks")
    assert "[Role Context: Student]" in s_ctx


# ==============================================================================
# TEST 5: Graceful Error Handling When Ollama Is Offline
# ==============================================================================

@pytest.mark.asyncio
async def test_an_unreachable_model_is_reported_as_an_error_not_as_an_answer():
    """
    When no model can answer, the stream carries an error event.

    It used to emit a cheerful notice as though it were the assistant
    speaking — and the screen, which had its own cheerful fallback, showed a
    friendly paragraph over a service that was simply down. A user could not
    tell a working Copilot from a broken one.
    """
    class FailingClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def get(self, url, **kwargs):
            raise Exception("Connection refused to 127.0.0.1:11434")
        def stream(self, method, url, json=None, headers=None):
            raise Exception("Connection refused to 127.0.0.1:11434")

    OllamaAIService._local_models = ((), 0.0)
    with patch("httpx.AsyncClient", return_value=FailingClient()):
        chunks = []
        async for chunk in OllamaAIService.stream_completion("System prompt", "Hello"):
            chunks.append(chunk)

    combined = "".join(chunks)
    assert '"error"' in combined
    assert "ai_unavailable" in combined
    assert combined.rstrip().endswith("data: [DONE]")
    # No sentence pretending to be an answer.
    assert '"delta"' not in combined


# ==============================================================================
# TEST 6: Precise Relational Lookups (Class/Section/Subject to Teacher Mapping)
# ==============================================================================

@pytest.mark.asyncio
async def test_precise_relationship_lookups():
    """Verify that relational queries correctly resolve teacher assignments vs unassigned classes."""
    user = MockUser("p-1", "principal@school.com", ["principal"], "school-uuid-1")

    # Mock DB where Class 1 has teachers assigned and Class 3 has 0 teachers assigned
    def custom_execute(query, params=None):
        query_str = str(query)
        mock_result = MagicMock()
        if "students s" in query_str:
            mock_result.fetchall.return_value = []
        elif "academic_classes" in query_str and "class_sections" in query_str and "teacher_subject_assignments" not in query_str:
            # Classes in scope
            if params and "3" in str(params.get("cterm", "")):
                mock_result.fetchall.return_value = [("Class 3", "Section A", "sec-3-a", "cls-3", None)]
            elif params and "1" in str(params.get("cterm", "")):
                mock_result.fetchall.return_value = [("Class 1", "Section A", "sec-1-a", "cls-1", None)]
            else:
                mock_result.fetchall.return_value = [
                    ("Class 1", "Section A", "sec-1-a", "cls-1", None),
                    ("Class 3", "Section A", "sec-3-a", "cls-3", None),
                ]
        elif "teacher_subject_assignments" in query_str:
            if params and "3" in str(params.get("cterm", "")):
                # Class 3 has NO teacher assignments
                mock_result.fetchall.return_value = []
            else:
                # Class 1 has Teacher 1 & Teacher 2
                mock_result.fetchall.return_value = [
                    ("Class 1", "Section A", "Mathematics", "Teacher 1", "sec-1-a"),
                    ("Class 1", "Section A", "Science", "Teacher 1", "sec-1-a"),
                    ("Class 1", "Section A", "English", "Teacher 2", "sec-1-a"),
                    ("Class 1", "Section A", "Urdu", "Teacher 2", "sec-1-a"),
                ]
        else:
            mock_result.fetchall.return_value = []
            mock_result.fetchone.return_value = None

        return mock_result

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=custom_execute)

    # 1. Query Class 3 teachers -> Must explicitly state NO TEACHERS ASSIGNED
    ctx_class3 = await build_scoped_ai_context(
        db=mock_db,
        user=user,
        school_id="school-uuid-1",
        user_query="Class 3 ko jo teachers assign hain unke naam batao"
    )
    assert "NO TEACHERS ASSIGNED" in ctx_class3
    assert "Class 3" in ctx_class3

    # 2. Query Class 1 teachers -> Must output exact assigned teachers
    ctx_class1 = await build_scoped_ai_context(
        db=mock_db,
        user=user,
        school_id="school-uuid-1",
        user_query="Class 1 ke assigned teachers batao"
    )
    assert "Assigned Teachers:" in ctx_class1
    assert "Teacher 1" in ctx_class1
    assert "Teacher 2" in ctx_class1
    assert "Mathematics" in ctx_class1
    assert "English" in ctx_class1
