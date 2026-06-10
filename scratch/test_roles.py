import asyncio
import httpx

async def test_roles():
    login_url = "http://localhost:8000/api/auth/login"
    roles_url = "http://localhost:8000/api/auth/user-roles"
    
    payload = {
        "email": "beaconryk@gmail.com",
        "password": "Principal888"
    }
    
    print("Sending login request...", flush=True)
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(login_url, json=payload)
            print("Login response status:", resp.status_code, flush=True)
            if resp.status_code != 200:
                print("Login failed:", resp.text, flush=True)
                return
            
            data = resp.json()
            token = data.get("access_token")
            user_id = data.get("user_id")
            print(f"Logged in successfully. User ID: {user_id}", flush=True)
            
            # Now request user roles
            headers = {
                "Authorization": f"Bearer {token}"
            }
            params = {
                "school_id": "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8",
                "user_id": user_id
            }
            print("\nQuerying user-roles endpoint...", flush=True)
            roles_resp = await client.get(roles_url, headers=headers, params=params)
            print("Roles response status:", roles_resp.status_code, flush=True)
            print("Roles response body:", roles_resp.json(), flush=True)
            
        except Exception as e:
            print("Test failed with exception:", e, flush=True)

if __name__ == "__main__":
    asyncio.run(test_roles())
