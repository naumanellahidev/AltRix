# -*- coding: utf-8 -*-
import asyncio
import json
import httpx
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

async def run_query(q):
    sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
    user = MockUser("6e3e1047-c839-4e86-9be6-3131ca8ad474", "principal@beaconhouse.edu.pk", ["principal"], sid)
    async with AsyncSessionLocal() as db:
        ctx = await build_scoped_ai_context(db=db, user=user, school_id=sid, user_query=q)
    
    prompt = f"""You are the **AltRix AI Copilot**, an intelligent, context-aware operational assistant for AltRix ERP.
You MUST reply in the EXACT language and dialect used by the user (Roman Urdu for Roman Urdu queries, English for English queries, Urdu for Urdu script).

### LIVE ERP DATABASE RECORDS:
{ctx}

### INSTRUCTIONS:
1. **Language Matching**: If query is in Roman Urdu, reply ONLY in clear Roman Urdu.
2. **Relational Teacher Lookups (5A)**:
   - Check 'Class-to-Teacher Subject Assignments' and 'Targeted Search Results' in the database records above.
   - If the class has assigned teachers, list only the assigned teachers and their subjects.
   - If the class has NO teachers assigned (e.g. Class 3), reply directly in Roman Urdu: 'Class 3 ko filhal koi teacher assign nahi hai.' or in English: 'No teachers are currently assigned to Class 3.'
   - If the class does not exist, state: 'Class [X] school records mein register nahi hai.'
   - Never give generic explanations, instructions on how to find teachers, or list unrelated staff.
3. **Strict Factuality**: Answer strictly using the database records above. Never invent records. Never output raw UUIDs in visible text.
"""

    print(f"=== QUERY: '{q}' ===")
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
            except Exception:
                pass
    print("\n")

async def main():
    await run_query("Class 3 ko jo teachers assign hain unke naam batao.")
    await run_query("Class 1 ke assigned teachers batao.")
    await run_query("Class 2 ka computer science teacher kaun hai?")
    await run_query("Which teachers are assigned to Class 3?")

if __name__ == "__main__":
    asyncio.run(main())
