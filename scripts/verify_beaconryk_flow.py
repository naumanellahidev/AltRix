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

print("=== 1. FULL LOGIN AS beaconryk@gmail.com ===")
login_req = urllib.request.Request(
    f"{BASE_URL}/auth/login",
    data=json.dumps({"email": "beaconryk@gmail.com", "password": "Principal888"}).encode("utf-8"),
    headers=HEADERS
)

with urllib.request.urlopen(login_req, timeout=10, context=ctx) as resp:
    status_code = resp.status
    login_data = json.loads(resp.read().decode())
    print(f"Login HTTP Status: {status_code}")
    print(f"User ID: {login_data.get('user_id')}")
    print(f"Email: {login_data.get('email')}")
    access_token = login_data.get("access_token")

auth_headers = {
    **HEADERS,
    "Authorization": f"Bearer {access_token}"
}

print("\n=== 2. QUERY SCHOOL (beacon) ===")
school_req = urllib.request.Request(
    f"{BASE_URL}/vps-db/query",
    data=json.dumps({
        "table": "schools",
        "action": "select",
        "select": "*",
        "filters": [
            {"method": "eq", "args": ["slug", "beacon"]},
            {"method": "maybeSingle", "args": []}
        ]
    }).encode("utf-8"),
    headers=auth_headers
)

with urllib.request.urlopen(school_req, timeout=10, context=ctx) as resp:
    school_data = json.loads(resp.read().decode())
    school = school_data.get("data", [{}])[0]
    school_id = school.get("id")
    print(f"School ID: {school_id}, Name: {school.get('name')}")

print("\n=== 3. QUERY MEMBERSHIP (school_memberships) ===")
mem_req = urllib.request.Request(
    f"{BASE_URL}/vps-db/query",
    data=json.dumps({
        "table": "school_memberships",
        "action": "select",
        "select": "id",
        "filters": [
            {"method": "eq", "args": ["school_id", school_id]},
            {"method": "eq", "args": ["user_id", login_data.get("user_id")]},
            {"method": "maybeSingle", "args": []}
        ]
    }).encode("utf-8"),
    headers=auth_headers
)

with urllib.request.urlopen(mem_req, timeout=10, context=ctx) as resp:
    mem_res = json.loads(resp.read().decode())
    print(f"Membership query result: {mem_res}")
    membership = mem_res.get("data")

print("\n=== 4. QUERY ROLES (user_roles) ===")
role_req = urllib.request.Request(
    f"{BASE_URL}/vps-db/query",
    data=json.dumps({
        "table": "user_roles",
        "action": "select",
        "select": "role",
        "filters": [
            {"method": "eq", "args": ["school_id", school_id]},
            {"method": "eq", "args": ["user_id", login_data.get("user_id")]}
        ]
    }).encode("utf-8"),
    headers=auth_headers
)

with urllib.request.urlopen(role_req, timeout=10, context=ctx) as resp:
    role_res = json.loads(resp.read().decode())
    print(f"Roles query result: {role_res}")
    roles = [r["role"] for r in role_res.get("data", [])]
    print(f"Resolved roles: {roles}")

is_member = bool(membership) or len(roles) > 0
print(f"\nis_member: {is_member}")
if is_member:
    dest_role = roles[0] if roles else None
    print(f"SUCCESS! User will be routed to: /beacon/{dest_role}")
else:
    print("FAILURE: User not recognized as member")
