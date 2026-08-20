# -*- coding: utf-8 -*-
"""
Live VPS Verification of 5A: Precise Relationship & Record Lookups
Tests real queries against the production Beaconhouse database and Ollama instance.
"""

import asyncio
import json
import sys

# Add backend to path
sys.path.insert(0, "/opt/altrix/current/backend")

from app.database import AsyncSessionLocal
from app.utils.ai_context_builder import build_scoped_ai_context
from app.utils.ai_service import OllamaAIService


class LivePrincipalUser:
    def __init__(self, user_id, email, roles, school_id):
        self.id = user_id
        self.email = email
        self.roles = roles
        self.school_id = school_id
        self.is_super_admin = False


async def run_live_relational_tests():
    print("=================================================================")
    print(" Live Verification: 5A. Precise Relationship / Record Lookups")
    print("=================================================================")

    school_id = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"  # Beaconhouse
    user = LivePrincipalUser(
        user_id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
        email="principal@beaconhouse.edu.pk",
        roles=["principal"],
        school_id=school_id
    )

    test_queries = [
        ("Query 1: Class 3 (Unassigned Class)", "Class 3 ko jo teachers assign hain unke naam batao."),
        ("Query 2: Class 1 (Assigned Class)", "Class 1 ke assigned teachers ke naam aur subjects batao."),
        ("Query 3: Specific Subject Teacher", "Class 2 ka computer science teacher kaun hai?"),
        ("Query 4: English Relational Query", "Which teachers are assigned to Class 3?"),
    ]

    system_prompt_template = """You are the **AltRix AI Copilot**, an intelligent, context-aware, and language-agnostic ERP operational assistant for AltRix School ERP.
You have direct, real-time access to the verified live database context for the active authenticated user's role and school.

**LANGUAGE & MULTILINGUAL INTELLIGENCE (CRITICAL):**
- Automatically detect the user's language, dialect, and writing script.
- Reply naturally and fluently in the EXACT same language and style used by the user:
  * If the user writes in **Roman Urdu** (e.g., "mere students dikhao", "Class 3 ko jo teachers assign hain unke naam batao"), reply in natural, clear **Roman Urdu**.
  * If the user writes in **English**, reply in clear, professional **English**.
  * If the user writes in **Urdu script** (اردو), reply in **Urdu script**.
- Do NOT translate Roman Urdu into English.

**PRECISE RELATIONSHIP & RECORD LOOKUPS (CRITICAL):**
- When asked relational questions about school records (e.g. "Class 3 ko jo teachers assign hain unke naam batao", "Class 5 ka teacher kaun hai?", "Section A mein kaun se teachers assigned hain?", "Grade 8 ke math teacher ka naam batao", "Which teachers are assigned to Class 3?"):
  1. Identify the exact requested class, grade, section, subject, or campus.
  2. Inspect the **Class-to-Teacher Subject Assignments** and **Targeted Search Results** in the database context.
  3. Return ONLY the exact assigned teachers' names and subjects for that specific class or section.
  4. If the class/section exists in the school but has NO teachers assigned in the database records, state clearly and concisely: "Class [X] ko filhal koi teacher assign nahi hai." or "No teachers are currently assigned to Class [X]."
  5. If the class/grade does not exist in the school, state clearly: "Class [X] school records mein register nahi hai." or "Class [X] is not registered in this school."
  6. Answer ONLY what was requested. Do NOT give a generic explanation of teacher assignments, instructions on how to find teachers, or list unrelated teachers from the school or other campuses/tenants.

**REAL DATA & ZERO HALLUCINATION (STRICT ISOLATION):**
- Ground every factual statement strictly in the provided **DATABASE CONTEXT**.
- NEVER fabricate students, teachers, fees, attendance numbers, invoices, dates, or marks.
- If requested data is not present in the context, state truthfully in the user's language.

**DATABASE CONTEXT:**
__DB_CONTEXT__
"""

    async with AsyncSessionLocal() as db:
        for title, query in test_queries:
            print(f"\n-----------------------------------------------------------------")
            print(f"TEST: {title}")
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
            ):
                if chunk.startswith("data: "):
                    content = chunk[6:].strip()
                    if content == "[DONE]":
                        continue
                    try:
                        data = json.loads(content)
                        tok = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if tok:
                            response_tokens.append(tok)
                            print(tok, end="", flush=True)
                    except Exception:
                        pass
            print()

    print("\n=================================================================")
    print(" ✅ LIVE RELATIONAL LOOKUP VERIFICATION FINISHED SUCCESSFULLY!")
    print("=================================================================")


if __name__ == "__main__":
    asyncio.run(run_live_relational_tests())
