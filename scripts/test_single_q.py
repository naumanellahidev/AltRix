# -*- coding: utf-8 -*-
import asyncio
import httpx
import json
from app.utils.jwt import create_access_token

async def test_q(client, token, query_text):
    print(f"\n=== ENDPOINT QUERY: '{query_text}' ===", flush=True)
    try:
        async with client.stream(
            "POST",
            "http://127.0.0.1:8000/api/ai/copilot",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "message": query_text,
                "history": [],
                "screen": "principal_home"
            },
            timeout=httpx.Timeout(240.0, connect=15.0, read=240.0)
        ) as resp:
            print(f"[HTTP {resp.status_code}]", flush=True)
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if content:
                            print(content, end="", flush=True)
                    except Exception:
                        pass
        print("\n[STREAM COMPLETE]", flush=True)
    except Exception as e:
        print(f"\n[ERROR: {e}]", flush=True)

async def main():
    token = create_access_token(
        user_id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
        email="principal@beaconhouse.edu.pk"
    )
    async with httpx.AsyncClient(timeout=240.0) as client:
        await test_q(client, token, "Class 3 ko jo teachers assign hain unke naam batao.")
        await test_q(client, token, "Class 1 ke assigned teachers batao.")
        await test_q(client, token, "Which teachers are assigned to Class 3?")

if __name__ == "__main__":
    asyncio.run(main())
