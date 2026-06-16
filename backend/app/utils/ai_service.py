import json
import logging
import httpx
from typing import AsyncGenerator, Dict, List
from app.config import settings

logger = logging.getLogger("app.ai_service")

class OllamaAIService:
    """
    Provider-agnostic service layer for self-hosted and cloud AI execution.
    Supports Ollama (local/cloud) as well as Gemini, OpenRouter, OpenAI, Groq, and DeepSeek APIs.
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
        elif provider == "gemini":
            reasoning_default = "gemini-1.5-pro"
            general_default = "gemini-1.5-flash"
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
        Includes automatic cloud fallback if primary provider (Ollama) is unreachable.
        """
        original_provider = settings.ai_provider.lower()
        original_model = cls.route_model(user_message)

        # 1. Define request details builder
        def get_request_params(prov: str, mdl: str):
            prov_lower = prov.lower()
            messages = [{"role": "system", "content": system_prompt}]
            if history:
                for msg in history:
                    messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": user_message})

            if prov_lower == "ollama":
                payload = {
                    "model": mdl,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": 0.3 if "r1" in mdl.lower() or "reason" in mdl.lower() else 0.7
                    }
                }
                base_url = settings.ollama_url.rstrip('/')
                if base_url.endswith("/api"):
                    url = f"{base_url}/chat"
                else:
                    url = f"{base_url}/api/chat"
                
                headers = {}
                api_key = settings.ai_api_key or settings.gemini_api_key
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
            else:
                if prov_lower == "gemini":
                    base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
                    api_key = settings.gemini_api_key or settings.ai_api_key
                elif prov_lower == "openai":
                    base_url = settings.ai_api_base or "https://api.openai.com/v1"
                    api_key = settings.ai_api_key
                elif prov_lower == "openrouter":
                    base_url = settings.ai_api_base or "https://openrouter.ai/api/v1"
                    api_key = settings.ai_api_key
                elif prov_lower == "groq":
                    base_url = settings.ai_api_base or "https://api.groq.com/openai/v1"
                    api_key = settings.ai_api_key
                elif prov_lower == "deepseek":
                    base_url = settings.ai_api_base or "https://api.deepseek.com/v1"
                    api_key = settings.ai_api_key
                else:
                    base_url = settings.ai_api_base or "https://api.openai.com/v1"
                    api_key = settings.ai_api_key

                url = f"{base_url.rstrip('/')}/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                if prov_lower == "openrouter":
                    headers["HTTP-Referer"] = "https://altrix.school"
                    headers["X-Title"] = "AltRix ERP"

                payload = {
                    "model": mdl,
                    "messages": messages,
                    "stream": True
                }
                if mdl != "deepseek-reasoner":
                    payload["temperature"] = 0.2 if ("reason" in mdl.lower() or "r1" in mdl.lower()) else 0.7
            
            return url, headers, payload

        # 2. Determine fallback settings
        fallback_provider = None
        fallback_model = None

        if original_provider == "ollama":
            if settings.gemini_api_key:
                fallback_provider = "gemini"
                # Determine fallback models manually using the same routing logic for gemini
                reasoning_keywords = ["compare", "analyze", "trend", "report", "why", "performance", "defaulter", "weak", "average", "outstanding", "revenue", "grades", "marks", "fail", "pass", "top", "analytics"]
                if any(k in user_message.lower() for k in reasoning_keywords):
                    fallback_model = settings.ai_reasoning_model or "gemini-1.5-pro"
                else:
                    fallback_model = settings.ai_general_model or "gemini-1.5-flash"
            elif settings.ai_api_key and settings.ai_provider.lower() != "ollama":
                fallback_provider = settings.ai_provider.lower()
                original_prov_cfg = settings.ai_provider
                try:
                    settings.ai_provider = fallback_provider
                    fallback_model = cls.route_model(user_message)
                finally:
                    settings.ai_provider = original_prov_cfg

        # 3. Compile execution attempts list
        attempts = [(original_provider, original_model)]
        if fallback_provider and fallback_model:
            attempts.append((fallback_provider, fallback_model))

        last_error = None
        for current_prov, current_model in attempts:
            url, headers, payload = get_request_params(current_prov, current_model)
            logger.info(f"Connecting to AI provider '{current_prov}' at {url} using model '{current_model}'")
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream("POST", url, json=payload, headers=headers) as response:
                        if response.status_code != 200:
                            err_text = await response.aread()
                            err_msg = f"AI provider ({current_prov}) returned error status {response.status_code}: {err_text.decode('utf-8', errors='ignore')}"
                            logger.error(err_msg)
                            last_error = err_msg
                            if current_prov == original_provider and fallback_provider:
                                logger.warning("Primary provider request failed. Attempting fallback...")
                                continue
                            yield f"data: {json.dumps({'error': f'AI provider returned status {response.status_code}'})}\n\n"
                            yield "data: [DONE]\n\n"
                            return

                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue
                            
                            if current_prov == "ollama":
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
                                        continue

                # Successful stream execution, exit loop and complete generator
                yield "data: [DONE]\n\n"
                return

            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RequestError) as e:
                logger.error(f"Connection to AI provider ({current_prov}) failed: {e}")
                last_error = str(e)
                if current_prov == original_provider and fallback_provider:
                    logger.warning("Primary provider connection failed. Attempting fallback...")
                    continue
                yield f"data: {json.dumps({'error': f'Failed to connect to AI provider ({current_prov}).'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            except Exception as e:
                logger.error(f"Unexpected error with AI provider ({current_prov}): {e}")
                last_error = str(e)
                if current_prov == original_provider and fallback_provider:
                    logger.warning("Primary provider encountered unexpected error. Attempting fallback...")
                    continue
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"
                return

        # If all attempts failed
        yield f"data: {json.dumps({'error': f'All AI providers failed. Last error: {last_error}'})}\n\n"
        yield "data: [DONE]\n\n"
