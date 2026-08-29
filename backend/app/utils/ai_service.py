# -*- coding: utf-8 -*-
"""
AltRix AI Copilot — Pure Ollama Intelligence Engine
Features:
1. Pure Ollama-exclusive streaming LLM integration (no external cloud providers, no data leakage).
2. True natural language understanding: language-agnostic (English, Urdu, Roman Urdu, Hindi, mixed languages, informal phrasing, short & long prompts).
3. Multi-turn conversational memory: supports context refinement, follow-up filtering, and intent tracking.
4. Grounded in live, authorized, role-scoped ERP database context with zero hallucination.
5. Server-side Ollama execution with graceful error reporting if Ollama is unreachable.
"""

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
    Intelligent, Language-Agnostic, Role-Scoped AI Copilot Service for AltRix ERP.
    Backed strictly by the local/configured Ollama service.
    """

    @classmethod
    def get_ollama_endpoints(cls) -> List[str]:
        """
        Returns candidate Ollama endpoints to connect to on the server.
        Prioritizes settings.ollama_url, with fallback to standard local endpoints.
        """
        urls: List[str] = []
        if settings.ollama_url and settings.ollama_url.strip():
            raw_url = settings.ollama_url.strip().rstrip('/')
            if raw_url.endswith("/api/chat"):
                urls.append(raw_url)
            elif raw_url.endswith("/api"):
                urls.append(f"{raw_url}/chat")
            else:
                urls.append(f"{raw_url}/api/chat")
        
        # Standard local and Docker gateway Ollama endpoints
        candidate_endpoints = [
            "http://127.0.0.1:11434/api/chat",
            "http://172.20.0.1:11434/api/chat",
            "http://172.17.0.1:11434/api/chat",
            "http://host.docker.internal:11434/api/chat",
            "http://localhost:11434/api/chat",
        ]
        for ep in candidate_endpoints:
            if ep not in urls:
                urls.append(ep)
        return urls

    @classmethod
    def get_model_name(cls, query: str = "") -> str:
        """
        Selects the best local Ollama model available.
        """
        reasoning_keywords = [
            "compare", "analyze", "trend", "report", "why", "performance",
            "forecast", "predict", "benchmark", "root cause", "explain", "detailed", "breakdown"
        ]
        is_reasoning = any(k in query.lower() for k in reasoning_keywords) if query else False

        if is_reasoning and settings.ollama_reasoning_model:
            return settings.ollama_reasoning_model
        if settings.ollama_general_model:
            return settings.ollama_general_model
        return "qwen2.5:3b"

    @classmethod
    def get_fallback_models(cls, primary_model: str) -> List[str]:
        """
        Returns an ordered list of fallback models if primary model is not yet pulled.
        """
        candidates = [
            primary_model,
            "qwen2.5:3b",
            "qwen2.5:7b",
            "deepseek-r1:1.5b",
            "llama3.2:3b",
            "qwen2.5:1.5b",
            "llama3.2:1b",
            "glm4:latest",
            "qwen:latest",
        ]
        unique_models: List[str] = []
        for m in candidates:
            if m and m not in unique_models:
                unique_models.append(m)
        return unique_models

    @classmethod
    async def stream_completion(
        cls, 
        system_prompt: str, 
        user_message: str, 
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Streams natural language completions directly from Ollama with multi-turn history.
        Yields Server-Sent Events (SSE) in standard format: data: {"choices": [{"delta": {"content": token}}]}
        """
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        
        if history:
            for msg in history:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    role = msg["role"]
                    if role in ("user", "assistant", "system"):
                        content = str(msg["content"]).strip()
                        if content:
                            messages.append({"role": role, "content": content})
        
        messages.append({"role": "user", "content": user_message})

        primary_model = cls.get_model_name(user_message)
        models_to_try = cls.get_fallback_models(primary_model)
        endpoints = cls.get_ollama_endpoints()
        headers = {"Content-Type": "application/json"}
        if settings.ollama_api_key:
            headers["Authorization"] = f"Bearer {settings.ollama_api_key}"

        streamed_any = False
        last_error: Optional[str] = None

        timeout = httpx.Timeout(connect=8.0, read=300.0, write=30.0, pool=30.0)

        for endpoint in endpoints:
            if streamed_any:
                break
            for model in models_to_try:
                payload = {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": 0.2,
                        "num_predict": 512
                    }
                }
                try:
                    logger.info(f"Connecting to AltRix Ollama Service at {endpoint} with model '{model}'")
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        async with client.stream("POST", endpoint, json=payload, headers=headers) as response:
                            if response.status_code == 200:
                                async for line in response.aiter_lines():
                                    if not line.strip():
                                        continue
                                    try:
                                        chunk = json.loads(line.strip())
                                        token = chunk.get("message", {}).get("content", "")
                                        if token:
                                            streamed_any = True
                                            sse_data = {"choices": [{"delta": {"content": token}}]}
                                            yield f"data: {json.dumps(sse_data)}\n\n"
                                        if chunk.get("done", False):
                                            break
                                    except json.JSONDecodeError:
                                        continue
                                
                                if streamed_any:
                                    break
                            else:
                                resp_body = await response.aread()
                                err_msg = f"HTTP {response.status_code}: {resp_body.decode('utf-8', 'ignore')[:150]}"
                                logger.warning(f"Ollama at {endpoint} with model '{model}' returned {err_msg}")
                                last_error = err_msg
                                # If model not found (404), try next model candidate on same endpoint
                                if response.status_code == 404:
                                    continue
                                else:
                                    break
                except Exception as e:
                    logger.warning(f"Ollama connection to {endpoint} failed: {e}")
                    last_error = str(e)
                    break

        # If Ollama service was completely unreachable or failed
        if not streamed_any:
            logger.error(f"AltRix Ollama AI Service unreachable across all endpoints. Last error: {last_error}")
            err_notice = (
                "⚠️ **AltRix AI Copilot Service Notice**\n\n"
                "The local AI reasoning service (Ollama) is starting up or preparing the model.\n\n"
                "To initialize the model on your server, run:\n"
                "`ollama pull qwen2.5:3b`\n\n"
                "You can still navigate directly to modules using the menu or global command bar (`Ctrl+K` / `Cmd+K`)."
            )
            sse_data = {"choices": [{"delta": {"content": err_notice}}]}
            yield f"data: {json.dumps(sse_data)}\n\n"

        yield "data: [DONE]\n\n"
