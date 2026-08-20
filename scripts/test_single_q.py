# -*- coding: utf-8 -*-
import asyncio
import httpx
import json
from app.utils.jwt import create_access_token

async def test_q(client, token, q):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "message": q,
        "history": [],
        "current_module": "Academics",
        "current_screen": "Teachers & Classes"
    }
    print(f"=== ENDPOINT QUERY: '{q}' ===", flush=True)
    try:
        async with client.stream("POST", "http://127.0.0.1:8000/api/ai/copilot", json=payload, headers=headers) as resp:
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        continue
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            print(delta, end="", flush=True)
                    except Exception:
                        pass
    except Exception as e:
        print(f"\n[QUERY EXCEPTION]: {e}", flush=True)
    print("\n", flush=True)

async def main():
    token = create_access_token(
        user_id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
        email="principal@beaconhouse.edu.pk"
    )
    async with httpx.AsyncClient(timeout=180.0) as client:
        await test_q(client, token, "Class 1 ke assigned teachers batao.")
        await test_q(client, token, "Which teachers are assigned to Class 3?")

if __name__ == "__main__":
    asyncio.run(main())
