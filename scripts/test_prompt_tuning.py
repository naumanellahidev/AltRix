# -*- coding: utf-8 -*-
import asyncio
import json
from app.database import AsyncSessionLocal
from app.utils.ai_context_builder import build_scoped_ai_context
from app.utils.ai_service import OllamaAIService

class MockUser:
    def __init__(self, uid, email, roles, sid):
        self.id = uid
        self.email = email
        self.roles = roles
        self.school_id = sid
        self.is_super_admin = False

async def main():
    sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
    user = MockUser("6e3e1047-c839-4e86-9be6-3131ca8ad474", "principal@beaconhouse.edu.pk", ["principal"], sid)
    
    queries = [
        ("Query 1 (Roman Urdu - Unassigned Class)", "Class 3 ko jo teachers assign hain unke naam batao."),
        ("Query 2 (Roman Urdu - Assigned Class)", "Class 1 ke assigned teachers ke naam aur subjects batao."),
        ("Query 3 (Roman Urdu - Specific Subject)", "Class 2 ka computer science teacher kaun hai?"),
        ("Query 4 (English - Unassigned Class)", "Which teachers are assigned to Class 3?"),
    ]
    
    async with AsyncSessionLocal() as db:
        for title, q in queries:
            print(f"\n==================================================")
            print(f"{title}")
            print(f"QUERY: '{q}'")
            print(f"==================================================")
            
            db_ctx = await build_scoped_ai_context(db=db, user=user, school_id=sid, user_query=q)
            
            prompt = f"""You are the **AltRix AI Copilot**, an intelligent, context-aware operational ERP assistant for AltRix School ERP.
Always reply in the EXACT SAME LANGUAGE and script used by the user (Roman Urdu for Roman Urdu queries, English for English queries, Urdu for Urdu script).

### LIVE ERP DATABASE RECORDS:
{db_ctx}

### INSTRUCTIONS:
1. **Language Matching**: If the user writes in Roman Urdu (e.g. "Class 3 ko jo teachers assign hain unke naam batao", "mere students dikhao"), reply in natural Roman Urdu. If in English, reply in English.
2. **Relational Teacher Lookups (CRITICAL)**:
   - When asked about assigned teachers of a class or section:
     * Check "Class-to-Teacher Subject Assignments" and "Targeted Search Results" in the records above.
     * If the class has assigned teachers, list only the assigned teachers and their subjects.
     * If the class has NO teachers assigned (e.g. Class 3), state clearly: "Class 3 ko filhal koi teacher assign nahi hai." or "No teachers are currently assigned to Class 3."
     * If the class does not exist, state: "Class [X] school records mein register nahi hai."
     * Do NOT give generic explanations, instructions on how to find teachers, or list unrelated teachers.
3. **Strict Factuality**: Answer strictly using the database records above. Never invent records. Never output raw UUIDs in visible text.
"""
            
            resp = []
            async for chunk in OllamaAIService.stream_completion(prompt, q):
                if chunk.startswith("data: "):
                    c = chunk[6:].strip()
                    if c == "[DONE]":
                        continue
                    try:
                        d = json.loads(c)
                        t = d.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if t:
                            print(t, end="", flush=True)
                            resp.append(t)
                    except Exception:
                        pass
            print()

if __name__ == "__main__":
    asyncio.run(main())
