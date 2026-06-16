import json
import logging
import httpx
from typing import AsyncGenerator, Dict, List
from app.config import settings

logger = logging.getLogger("app.ai_service")

class OllamaAIService:
    """
    Provider-agnostic service layer for self-hosted and cloud AI execution.
    Supports Ollama (local/cloud) as well as OpenRouter, OpenAI, Groq, and DeepSeek APIs.
    """

    @classmethod
    def route_model(cls, query: str) -> str:
        """
        Intelligent model routing based on query analysis:
        - Reasoning model for reasoning, analytical, comparative, grades, fee defaulters, and metrics-heavy tasks.
        - General model for general assistance, chat, navigation, report creation triggers, and standard conversational requests.
        """
        reasoning_keywords = [
            "compare", "analyze", "trend", "report", "why", "performance",
            "defaulter", "weak", "average", "outstanding", "revenue",
            "grades", "marks", "fail", "pass", "top", "analytics"
        ]
        query_lower = query.lower()
        provider = settings.ai_provider.lower()

        # Determine default models based on provider
        if provider == "ollama":
            reasoning_default = settings.ollama_reasoning_model
            general_default = settings.ollama_general_model
        elif provider == "openai":
            reasoning_default = "o1-mini"
            general_default = "gpt-4o-mini"
        elif provider == "openrouter":
            reasoning_default = "deepseek/deepseek-r1"
            general_default = "qwen/qwen-2.5-72b-instruct"
        elif provider == "groq":
            reasoning_default = "deepseek-r1-distill-llama-70b"
            general_default = "llama-3.3-70b-specdec"
        elif provider == "deepseek":
            reasoning_default = "deepseek-reasoner"
            general_default = "deepseek-chat"
        else:
            reasoning_default = "deepseek-r1"
            general_default = "qwen2.5"

        # Apply overrides from configuration if set
        reasoning_model = settings.ai_reasoning_model or reasoning_default
        general_model = settings.ai_general_model or general_default

        if any(keyword in query_lower for keyword in reasoning_keywords):
            logger.info(f"Routed query '{query[:40]}...' to reasoning model: {reasoning_model} (provider: {provider})")
            return reasoning_model
        
        logger.info(f"Routed query '{query[:40]}...' to general model: {general_model} (provider: {provider})")
        return general_model

    @classmethod
    async def stream_completion(
        cls, 
        system_prompt: str, 
        user_message: str, 
        history: List[Dict[str, str]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Connects to the configured provider (Ollama or Cloud OpenAI-compatible endpoint),
        routes to the correct model, and streams the response converted into OpenAI-compatible SSE.
        """
        model = cls.route_model(user_message)
        provider = settings.ai_provider.lower()

        # Build messages list
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        if provider == "ollama":
            payload = {
                "model": model,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": 0.3 if "r1" in model.lower() or "reason" in model.lower() else 0.7
                }
            }
            url = f"{settings.ollama_url.rstrip('/')}/api/chat"
            headers = {}
            logger.info(f"Connecting to Ollama service at: {url} using model {model}")
        else:
            # Cloud OpenAI-compatible providers
            if provider == "openai":
                base_url = settings.ai_api_base or "https://api.openai.com/v1"
            elif provider == "openrouter":
                base_url = settings.ai_api_base or "https://openrouter.ai/api/v1"
            elif provider == "groq":
                base_url = settings.ai_api_base or "https://api.groq.com/openai/v1"
            elif provider == "deepseek":
                base_url = settings.ai_api_base or "https://api.deepseek.com/v1"
            else:
                base_url = settings.ai_api_base or "https://api.openai.com/v1"

            url = f"{base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.ai_api_key}",
                "Content-Type": "application/json"
            }
            if provider == "openrouter":
                headers["HTTP-Referer"] = "https://altrix.school"
                headers["X-Title"] = "AltRix ERP"

            payload = {
                "model": model,
                "messages": messages,
                "stream": True
            }
            # Only add temperature if it's not deepseek-reasoner
            if model != "deepseek-reasoner":
                payload["temperature"] = 0.2 if ("reason" in model.lower() or "r1" in model.lower()) else 0.7

            logger.info(f"Connecting to Cloud AI provider: {provider} at {url} using model {model}")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        logger.error(f"AI provider ({provider}) returned error status {response.status_code}: {err_text}")
                        yield f"data: {json.dumps({'error': f'AI provider returned status {response.status_code}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        
                        if provider == "ollama":
                            try:
                                chunk = json.loads(line)
                                content = chunk.get("message", {}).get("content", "")
                                sse_data = {
                                    "choices": [
                                        {
                                            "delta": {
                                                "content": content
                                            }
                                        }
                                    ]
                                }
                                yield f"data: {json.dumps(sse_data)}\n\n"
                            except json.JSONDecodeError:
                                logger.warning(f"Failed to decode Ollama stream line: {line}")
                                continue
                        else:
                            # Standard OpenAI SSE format: data: {"choices": [{"delta": {"content": "word"}}]}
                            if line.startswith("data: "):
                                data_content = line[6:].strip()
                                if data_content == "[DONE]":
                                    continue
                                try:
                                    chunk = json.loads(data_content)
                                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if content:
                                        sse_data = {
                                            "choices": [
                                                {
                                                    "delta": {
                                                        "content": content
                                                    }
                                                }
                                            ]
                                        }
                                        yield f"data: {json.dumps(sse_data)}\n\n"
                                except json.JSONDecodeError:
                                    # Sometimes cloud streams contain other lines or noise, skip silently
                                    continue

            yield "data: [DONE]\n\n"
        except httpx.ConnectError as e:
            logger.error(f"Connection to AI provider ({provider}) failed at {url}: {e}")
            yield f"data: {json.dumps({'error': f'Failed to connect to AI provider ({provider}).'})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Unexpected error in AI service: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
