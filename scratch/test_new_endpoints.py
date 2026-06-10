import httpx

base_url = "http://localhost:8000/api"

async def main():
    print("Testing connection...")
    async with httpx.AsyncClient() as client:
        # 1. Fetch root
        try:
            resp = await client.get("http://localhost:8000/")
            print("Root response:", resp.json())
        except Exception as e:
            print("Connection failed:", e)
            return

        # 2. Test getting report card
        # We need a random UUID for testing. Since the database connection is mocked or falls back,
        # it should return a 401/403 or if we bypass auth, let's check what auth is needed.
        # Most routes require CurrentUser (jwt token).
        # Let's try to make a request without token and check if it returns 401 (unauthorized) instead of 404 or 422 or 500.
        print("\nTesting GET /exams/report-card/a4701267-3759-4fcf-bc08-bdf73c91fb65 (no auth):")
        resp = await client.get(f"{base_url}/exams/report-card/a4701267-3759-4fcf-bc08-bdf73c91fb65")
        print("Status:", resp.status_code)
        print("Body:", resp.text)

        print("\nTesting GET /auth/profiles/a4701267-3759-4fcf-bc08-bdf73c91fb65 (no auth):")
        resp = await client.get(f"{base_url}/auth/profiles/a4701267-3759-4fcf-bc08-bdf73c91fb65")
        print("Status:", resp.status_code)
        print("Body:", resp.text)

        print("\nTesting GET /exams/a4701267-3759-4fcf-bc08-bdf73c91fb65 (no auth):")
        resp = await client.get(f"{base_url}/exams/a4701267-3759-4fcf-bc08-bdf73c91fb65")
        print("Status:", resp.status_code)
        print("Body:", resp.text)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
