# -*- coding: utf-8 -*-
"""
The model behind the AltRix Copilot.

Two things were wrong with how this talked to a model, and together they are
most of why the Copilot "didn't really work":

* **It asked for a model the server does not have.** The configured name was
  ``glm-5.3``; the VPS has ``qwen2.5:1.5b``. Every message therefore walked a
  hard-coded list of eleven model names, taking a 404 from Ollama for each,
  before it reached the one that exists — several seconds of round trips
  before a single token, on every turn.
* **It ignored the cloud settings it already had.** ``AI_PROVIDER``,
  ``AI_API_KEY`` and ``AI_API_BASE`` existed in the configuration and in the
  production environment, and nothing read them, so a school that had paid for
  a capable model was still being answered by a 1.5B model on its own box.

This module resolves a provider once, asks the server which models it actually
has, and remembers the answer. A failure is reported as a failure: the caller
receives an error event, never a cheerful sentence that hides it.
"""

import json
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx

from app.config import settings

logger = logging.getLogger("app.ai_service")

#: OpenAI-compatible providers, by the name ``AI_PROVIDER`` may carry.
CLOUD_BASES: Dict[str, str] = {
    "glm": "https://api.z.ai/api/paas/v4",
    "zai": "https://api.z.ai/api/paas/v4",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "openai": "https://api.openai.com/v1",
}

#: A sensible model per provider when none is configured.
CLOUD_DEFAULT_MODELS: Dict[str, str] = {
    "glm": "glm-4.6",
    "zai": "glm-4.6",
    "zhipu": "glm-4-plus",
    "openrouter": "qwen/qwen-2.5-72b-instruct",
    "groq": "llama-3.3-70b-versatile",
    "deepseek": "deepseek-chat",
    "openai": "gpt-4o-mini",
}

#: Local models in the order we would rather have them, best first. Only ones
#: the server reports are ever requested.
LOCAL_PREFERENCE: Tuple[str, ...] = (
    "qwen2.5:14b", "qwen2.5:7b", "llama3.1:8b", "gemma2:9b",
    "qwen2.5:3b", "llama3.2:3b", "deepseek-r1:7b", "deepseek-r1:1.5b",
    "qwen2.5:1.5b", "llama3.2:1b",
)

#: Words that mark a question worth the slower, better model.
REASONING_SIGNALS = (
    "compare", "analyz", "analys", "trend", "report", "why", "performance",
    "forecast", "predict", "benchmark", "root cause", "explain", "detailed",
    "breakdown", "kyun", "kyu", "wajah", "tafseel",
)

#: How long a list of installed models is trusted. Long enough that a busy
#: school does not re-ask on every message; short enough that pulling a new
#: model is picked up within the lesson it was pulled in.
MODEL_CACHE_SECONDS = 300

#: Room for a full answer. 512 cut tables and lists off mid-row.
MAX_OUTPUT_TOKENS = 1024


class AIServiceError(RuntimeError):
    """No model could answer, and the caller must say so."""


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _delta(text: str) -> str:
    return _sse({"choices": [{"delta": {"content": text}}]})


class AIService:
    """Resolves a provider, streams an answer, and admits when it cannot."""

    # (models, fetched_at) for the local server.
    _local_models: Tuple[Tuple[str, ...], float] = ((), 0.0)

    # ── Provider resolution ──────────────────────────────────────────────────

    @classmethod
    def provider(cls) -> str:
        """
        ``ollama``, a cloud provider name, or ``auto``.

        ``auto`` means "the cloud if it is configured, otherwise the local
        server" — the shape most schools want: a good model when the key is
        there, and their own box when it is not.
        """
        raw = (settings.ai_provider or "ollama").strip().lower()
        if raw in ("", "auto"):
            return "auto"
        return raw

    @classmethod
    def cloud_config(cls) -> Optional[Dict[str, str]]:
        """The cloud endpoint to use, or None when no key is configured."""
        name = cls.provider()
        key = (settings.ai_api_key or "").strip()
        if not key:
            return None
        if name in ("ollama",):
            return None
        if name == "auto":
            # Only when the base URL says which service the key belongs to.
            base = (settings.ai_api_base or "").strip()
            if not base:
                return None
            resolved_name = "openai"
        else:
            if name not in CLOUD_BASES:
                logger.warning("Unknown AI_PROVIDER %r; falling back to the local model", name)
                return None
            resolved_name = name
            base = (settings.ai_api_base or "").strip() or CLOUD_BASES[name]

        return {
            "name": resolved_name,
            "base": base.rstrip("/"),
            "key": key,
        }

    # ── Model choice ─────────────────────────────────────────────────────────

    @classmethod
    def _wants_reasoning(cls, query: str) -> bool:
        lowered = (query or "").lower()
        return any(signal in lowered for signal in REASONING_SIGNALS)

    @classmethod
    def get_ollama_endpoints(cls) -> List[str]:
        """Where the local Ollama might be, the configured one first."""
        urls: List[str] = []
        configured = (settings.ollama_url or "").strip().rstrip("/")
        if configured:
            if configured.endswith("/api/chat"):
                urls.append(configured)
            elif configured.endswith("/api"):
                urls.append(f"{configured}/chat")
            else:
                urls.append(f"{configured}/api/chat")

        for candidate in (
            "http://127.0.0.1:11434/api/chat",
            "http://172.20.0.1:11434/api/chat",
            "http://172.17.0.1:11434/api/chat",
            "http://host.docker.internal:11434/api/chat",
            "http://localhost:11434/api/chat",
        ):
            if candidate not in urls:
                urls.append(candidate)
        return urls

    @classmethod
    async def installed_local_models(cls, force: bool = False) -> Tuple[str, ...]:
        """
        What the local server actually has, asked once and remembered.

        This is the whole fix for the eleven 404s: the names are read from
        ``/api/tags`` instead of guessed.
        """
        models, fetched_at = cls._local_models
        if models and not force and (time.monotonic() - fetched_at) < MODEL_CACHE_SECONDS:
            return models

        found: List[str] = []
        for endpoint in cls.get_ollama_endpoints():
            tags_url = endpoint.replace("/api/chat", "/api/tags")
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                    response = await client.get(tags_url)
                if response.status_code != 200:
                    continue
                for entry in response.json().get("models", []):
                    name = entry.get("model") or entry.get("name")
                    if name and name not in found:
                        found.append(name)
                if found:
                    break
            except Exception as exc:  # the next endpoint is the fallback
                logger.debug("Ollama at %s did not answer: %s", tags_url, exc)

        cls._local_models = (tuple(found), time.monotonic())
        return cls._local_models[0]

    @classmethod
    def choose_local_model(cls, installed: Tuple[str, ...], query: str = "") -> Optional[str]:
        """
        The best installed model, honouring a configured name when it exists.

        A configured model that is not installed is ignored rather than
        requested — asking for it is what produced the 404s.
        """
        if not installed:
            return None

        configured = (
            settings.ollama_reasoning_model if cls._wants_reasoning(query) else settings.ollama_general_model
        ) or ""
        configured = configured.strip()
        if configured:
            for name in installed:
                if name == configured or name.split(":")[0] == configured.split(":")[0]:
                    return name
            logger.info(
                "Configured model %r is not installed; using the best of %s",
                configured, ", ".join(installed),
            )

        for preferred in LOCAL_PREFERENCE:
            for name in installed:
                if name == preferred or name.split(":")[0] == preferred.split(":")[0]:
                    return name
        return installed[0]

    @classmethod
    def get_model_name(cls, query: str = "") -> str:
        """The configured model name. Kept for callers that only want a label."""
        configured = (
            settings.ollama_reasoning_model if cls._wants_reasoning(query) else settings.ollama_general_model
        )
        return (configured or "").strip() or "qwen2.5:1.5b"

    @classmethod
    def get_fallback_models(cls, primary_model: str) -> List[str]:
        """
        Kept so older callers keep working. It no longer drives the request:
        the model is chosen from what the server reports.
        """
        ordered: List[str] = []
        for name in (primary_model, *LOCAL_PREFERENCE):
            if name and name not in ordered:
                ordered.append(name)
        return ordered

    # ── Health ───────────────────────────────────────────────────────────────

    @classmethod
    async def health(cls) -> Dict[str, Any]:
        """
        What the Copilot can actually reach, for the screen to show plainly
        instead of leaving a user guessing why answers are thin.
        """
        cloud = cls.cloud_config()
        installed = await cls.installed_local_models(force=True)
        local_model = cls.choose_local_model(installed)
        return {
            "provider": cls.provider(),
            "cloud": (
                {"name": cloud["name"], "base": cloud["base"], "model": cls._cloud_model(cloud, "")}
                if cloud
                else None
            ),
            "local_models": list(installed),
            "local_model": local_model,
            "ready": bool(cloud or local_model),
        }

    @classmethod
    def _cloud_model(cls, cloud: Dict[str, str], query: str) -> str:
        configured = (
            settings.ai_reasoning_model if cls._wants_reasoning(query) else settings.ai_general_model
        ) or ""
        return configured.strip() or CLOUD_DEFAULT_MODELS.get(cloud["name"], "gpt-4o-mini")

    # ── Streaming ────────────────────────────────────────────────────────────

    @staticmethod
    def _messages(system_prompt: str, user_message: str, history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for entry in history or []:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role")
            content = str(entry.get("content") or "").strip()
            if role in ("user", "assistant", "system") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})
        return messages

    @classmethod
    async def _stream_cloud(
        cls, cloud: Dict[str, str], messages: List[Dict[str, str]], query: str
    ) -> AsyncGenerator[str, None]:
        """An OpenAI-compatible /chat/completions stream, passed straight through."""
        model = cls._cloud_model(cloud, query)
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
            "max_tokens": MAX_OUTPUT_TOKENS,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cloud['key']}",
        }
        timeout = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=30.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", f"{cloud['base']}/chat/completions", json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = (await response.aread()).decode("utf-8", "ignore")[:300]
                    raise AIServiceError(
                        f"{cloud['name']} refused the request (HTTP {response.status_code}): {body}"
                    )
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    token = (
                        (chunk.get("choices") or [{}])[0].get("delta", {}).get("content")
                        or ""
                    )
                    if token:
                        yield _delta(token)

    @classmethod
    async def _stream_local(
        cls, messages: List[Dict[str, str]], query: str
    ) -> AsyncGenerator[str, None]:
        """Ollama's own streaming format, from a model the server reports having."""
        installed = await cls.installed_local_models()
        model = cls.choose_local_model(installed, query)
        if not model:
            raise AIServiceError(
                "no local model is installed — run `ollama pull qwen2.5:3b` on the server, "
                "or set AI_PROVIDER and AI_API_KEY to use a cloud model"
            )

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": 0.2, "num_predict": MAX_OUTPUT_TOKENS},
        }
        headers = {"Content-Type": "application/json"}
        if settings.ollama_api_key:
            headers["Authorization"] = f"Bearer {settings.ollama_api_key}"
        timeout = httpx.Timeout(connect=8.0, read=300.0, write=30.0, pool=30.0)

        last_error: Optional[str] = None
        for endpoint in cls.get_ollama_endpoints():
            streamed = False
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", endpoint, json=payload, headers=headers) as response:
                        if response.status_code != 200:
                            body = (await response.aread()).decode("utf-8", "ignore")[:200]
                            last_error = f"HTTP {response.status_code}: {body}"
                            if response.status_code == 404:
                                # The list came from this server, so a 404 means
                                # it has changed: re-read it rather than guess.
                                await cls.installed_local_models(force=True)
                            continue
                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue
                            try:
                                chunk = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            token = chunk.get("message", {}).get("content", "")
                            if token:
                                streamed = True
                                yield _delta(token)
                            if chunk.get("done"):
                                break
                if streamed:
                    return
            except Exception as exc:
                last_error = str(exc)
                logger.warning("Ollama at %s failed: %s", endpoint, exc)

        raise AIServiceError(last_error or "the local AI service did not answer")

    @classmethod
    async def stream_completion(
        cls,
        system_prompt: str,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream an answer as Server-Sent Events.

        The cloud is used when it is configured, and the local server is the
        fallback — including when the cloud refuses the key, which is the case
        a school hits the day a subscription lapses. If neither can answer, the
        last event is an ``error``: the screen has to be able to say the
        Copilot is offline rather than invent a reply.
        """
        messages = cls._messages(system_prompt, user_message, history)
        cloud = cls.cloud_config()
        errors: List[str] = []
        produced = False

        if cloud:
            try:
                async for event in cls._stream_cloud(cloud, messages, user_message):
                    produced = True
                    yield event
            except Exception as exc:
                errors.append(f"{cloud['name']}: {exc}")
                logger.warning("Cloud AI provider failed: %s", exc)

        if not produced:
            try:
                async for event in cls._stream_local(messages, user_message):
                    produced = True
                    yield event
            except Exception as exc:
                errors.append(f"local: {exc}")
                logger.error("AltRix AI: no provider could answer. %s", "; ".join(errors))

        if not produced:
            yield _sse(
                {
                    "error": {
                        "code": "ai_unavailable",
                        "message": (
                            "The AI Copilot could not reach a model. "
                            + ("; ".join(errors) if errors else "No provider is configured.")
                        ),
                    }
                }
            )

        yield "data: [DONE]\n\n"


#: The name four routers already import. The service is no longer Ollama-only,
#: but renaming it at every call site buys nothing.
OllamaAIService = AIService
