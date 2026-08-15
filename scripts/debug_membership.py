import urllib.request
import json
import ssl
import sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

user_id = "6e3e1047-c839-4e86-9be6-3131ca8ad474"
school_id = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
email = "beaconryk@gmail.com"
print(f"User ID: {user_id}, School ID: {school_id}")

# 2. Login to get token
sys.path.append("/app")
from app.utils.jwt import create_access_token
token = create_access_token(user_id=user_id, email=email)

# 3. Simulate frontend query 1: school_memberships
payload1 = {
    "table": "school_memberships",
    "action": "select",
    "select": "id",
    "filters": [
        {"method": "eq", "args": ["school_id", school_id]},
        {"method": "eq", "args": ["user_id", user_id]},
        {"method": "maybeSingle", "args": []}
    ]
}

req1 = urllib.request.Request(
    "http://127.0.0.1:8000/api/vps-db/query",
    data=json.dumps(payload1).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0"
    }
)

try:
    with urllib.request.urlopen(req1, timeout=10, context=ctx) as resp:
        print("school_memberships response:", resp.read().decode())
except urllib.error.HTTPError as e:
    print(f"school_memberships HTTP ERROR: {e.code} - {e.read().decode()}")

# 4. Simulate frontend query 2: user_roles
payload2 = {
    "table": "user_roles",
    "action": "select",
    "select": "role",
    "filters": [
        {"method": "eq", "args": ["school_id", school_id]},
        {"method": "eq", "args": ["user_id", user_id]}
    ]
}

req2 = urllib.request.Request(
    "http://127.0.0.1:8000/api/vps-db/query",
    data=json.dumps(payload2).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0"
    }
)

try:
    with urllib.request.urlopen(req2, timeout=10, context=ctx) as resp:
        print("user_roles response:", resp.read().decode())
except urllib.error.HTTPError as e:
    print(f"user_roles HTTP ERROR: {e.code} - {e.read().decode()}")
