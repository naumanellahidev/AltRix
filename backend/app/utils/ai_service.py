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
        
        # Standard local Ollama daemon endpoints
        local_standard = "http://127.0.0.1:11434/api/chat"
        local_host = "http://localhost:11434/api/chat"
        if local_standard not in urls:
            urls.append(local_standard)
        if local_host not in urls:
            urls.append(local_host)
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
        return "qwen2.5:1.5b"

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

        model = cls.get_model_name(user_message)
        endpoints = cls.get_ollama_endpoints()
        headers = {"Content-Type": "application/json"}
        if settings.ollama_api_key:
            headers["Authorization"] = f"Bearer {settings.ollama_api_key}"

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.2,
                "num_predict": 512
            }
        }

        streamed_any = False
        last_error: Optional[str] = None

        for endpoint in endpoints:
            try:
                logger.info(f"Connecting to AltRix Ollama Service at {endpoint} with model '{model}'")
                timeout = httpx.Timeout(120.0, connect=5.0)
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
                            logger.warning(f"Ollama at {endpoint} returned {err_msg}")
                            last_error = err_msg
            except Exception as e:
                logger.warning(f"Ollama connection to {endpoint} failed: {e}")
                last_error = str(e)

        # If Ollama service was completely unreachable or failed
        if not streamed_any:
            logger.error(f"AltRix Ollama AI Service unreachable across all endpoints. Last error: {last_error}")
            err_notice = (
                "⚠️ **AltRix AI Copilot Service Unavailable**\n\n"
                "The local AI reasoning service (Ollama) is currently unreachable or starting up. "
                "Please verify that the Ollama service is active on the server (`systemctl status ollama`).\n\n"
                "You can still navigate directly to modules using the menu or global command bar (`Ctrl+K` / `Cmd+K`)."
            )
            sse_data = {"choices": [{"delta": {"content": err_notice}}]}
            yield f"data: {json.dumps(sse_data)}\n\n"

        yield "data: [DONE]\n\n"
