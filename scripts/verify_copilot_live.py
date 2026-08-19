# -*- coding: utf-8 -*-
"""
Live End-to-End Verification of AltRix AI Copilot Upgrade
Tests live execution with actual VPS database and Ollama instance.
"""

import asyncio
import os
import sys
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, "/opt/altrix/current/backend")

from app.database import async_session_factory
from app.utils.ai_context_builder import build_scoped_ai_context
from app.utils.ai_service import OllamaAIService


class LiveMockUser:
    def __init__(self, user_id, email, roles, school_id):
        self.id = user_id
        self.email = email
        self.roles = roles
        self.school_id = school_id
        self.is_super_admin = False


async def run_live_verification():
    print("=================================================================")
    print(" Starting Live AI Copilot Verification on Production VPS")
    print("=================================================================")

    # 1. Resolve active school
    async with async_session_factory() as db:
        from sqlalchemy import text
        s_res = await db.execute(text("SELECT id, name, slug FROM public.schools WHERE slug = 'beaconhouse' OR name ILIKE '%beacon%' LIMIT 1"))
        school = s_res.fetchone()
        if not school:
            s_res = await db.execute(text("SELECT id, name, slug FROM public.schools LIMIT 1"))
            school = s_res.fetchone()
        
        school_id = str(school[0])
        school_name = school[1]
        school_slug = school[2]
        print(f"[INFO] Verified Live School: {school_name} (ID: {school_id}, Slug: {school_slug})")

        # 2. Setup Principal User Context
        user = LiveMockUser(
            user_id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
            email="principal@beaconhouse.edu.pk",
            roles=["principal"],
            school_id=school_id
        )

        test_cases = [
            ("English Query", "How many students are enrolled in our school and what are their names?"),
            ("Roman Urdu Query", "mere school me kitne bachay parh rahe hain aur un k naam kya hain?"),
            ("Urdu Script Query", "طالب علموں کی تعداد کتنی ہے؟"),
            ("Mixed Urdu/English Query", "mujhe class 1 ke students ki list chahiye"),
            ("Follow-up Turn Query", "in me se absent kon hain?"),
        ]

        system_prompt_template = """You are the **AltRix AI Copilot**, an intelligent, context-aware, and language-agnostic ERP operational assistant for AltRix School ERP.
You have direct, real-time access to the verified live database context for the active authenticated user's role and school.

**LANGUAGE & MULTILINGUAL INTELLIGENCE (CRITICAL):**
- Automatically detect the user's language, dialect, and writing script.
- Reply naturally and fluently in the EXACT same language and style used by the user:
  * If the user writes in **Roman Urdu** (e.g., *"mere students dikhao"*, *"kitne bachay hain"*, *"students ki list chahiye"*), reply in natural, clear **Roman Urdu**.
  * If the user writes in **English**, reply in clear, professional **English**.
  * If the user writes in **Urdu script** (اردو), reply in **Urdu script**.
  * If the user writes in **mixed Urdu/English**, reply in natural, coherent **mixed language**.

**INTENT & DIRECTNESS:**
- Answer directly and concisely using the real data in the **DATABASE CONTEXT**.
- Never fabricate or hallucinate records.

**DATABASE CONTEXT:**
__DB_CONTEXT__
"""

        conversation_history = []

        for category, query in test_cases:
            print(f"\n-----------------------------------------------------------------")
            print(f"TEST: {category}")
            print(f"QUERY: '{query}'")
            print(f"-----------------------------------------------------------------")

            db_context = await build_scoped_ai_context(
                db=db,
                user=user,
                school_id=school_id,
                user_query=query,
            )

            prompt = system_prompt_template.replace("__DB_CONTEXT__", db_context)

            response_tokens = []
            async for chunk in OllamaAIService.stream_completion(
                system_prompt=prompt,
                user_message=query,
                history=conversation_history
            ):
                if chunk.startswith("data: "):
                    content = chunk[6:].strip()
                    if content == "[DONE]":
                        continue
                    try:
                        data = json.loads(content)
                        token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if token:
                            response_tokens.append(token)
                            print(token, end="", flush=True)
                    except Exception:
                        pass

            full_reply = "".join(response_tokens)
            print()
            assert len(full_reply) > 10, f"Response too short for {category}"

            # Append to multi-turn conversation history
            conversation_history.append({"role": "user", "content": query})
            conversation_history.append({"role": "assistant", "content": full_reply})

    print("\n=================================================================")
    print(" ✅ ALL LIVE AI COPILOT VERIFICATIONS COMPLETED SUCCESSFULLY!")
    print("=================================================================")


if __name__ == "__main__":
    asyncio.run(run_live_verification())
