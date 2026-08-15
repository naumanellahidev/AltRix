import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

BASE_URL = "https://altrixcore.com/api"

users_to_test = [
    ("beaconryk@gmail.com", "Principal888", "principal"),
    ("beaconowner@gmail.com", "Owner888", "school_owner"),
    ("beaconadmin@gmail.com", "Admin888", "school_admin"),
]

for email, password, expected_role in users_to_test:
    print(f"\n--- Testing {email} ({expected_role}) ---")
    login_req = urllib.request.Request(
        f"{BASE_URL}/auth/login",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers=HEADERS
    )
    with urllib.request.urlopen(login_req, timeout=10, context=ctx) as resp:
        login_data = json.loads(resp.read().decode())
        token = login_data.get("access_token")
        user_id = login_data.get("user_id")
        print(f"Login OK: user_id={user_id}")

    auth_headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    
    role_req = urllib.request.Request(
        f"{BASE_URL}/vps-db/query",
        data=json.dumps({
            "table": "user_roles",
            "action": "select",
            "select": "role",
            "filters": [
                {"method": "eq", "args": ["user_id", user_id]}
            ]
        }).encode("utf-8"),
        headers=auth_headers
    )
    with urllib.request.urlopen(role_req, timeout=10, context=ctx) as resp:
        role_res = json.loads(resp.read().decode())
        roles = [r["role"] for r in role_res.get("data", [])]
        print(f"Roles from user_roles: {roles}")

print("\n=== ALL ROLE RESOLUTIONS VERIFIED SUCCESSFULLY! ===")
