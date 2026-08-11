import urllib.request, json, os, subprocess

PROD_ENV = "/opt/altrix/shared/config/production.env"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

secret_key = get_env(PROD_ENV, "SECRET_KEY")

# Run python inside docker container to generate valid token
gen_token_cmd = "sudo docker exec altrix_backend python3 -c \"from app.utils.security import create_access_token; print(create_access_token({'user_id': 'd5fed9a7-5a4d-4ec2-a37c-e6bd474da1cc', 'sub': 'd5fed9a7-5a4d-4ec2-a37c-e6bd474da1cc', 'email': 'admin@beacon.com', 'school_id': '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'role': 'school_owner'}))\""

r = subprocess.run(gen_token_cmd, shell=True, capture_output=True, text=True)
token = r.stdout.strip()
print("Generated Token:", token[:40] + "...")

# Now test Authorized request
url = "http://127.0.0.1:8000/api/storage/files/student-photos/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8/d47a671d-695b-40df-aa4c-9596cb6c413c_1781261710107.png"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

try:
    with urllib.request.urlopen(req) as resp:
        print("AUTHORIZED SUCCESS! Status:", resp.status)
        print("MIME Type:", resp.headers.get("Content-Type"))
        print("File Size Read:", len(resp.read()))
except Exception as e:
    print("AUTHORIZED ERROR:", e)

# Test Unauthorized request
req_unauth = urllib.request.Request(url)
try:
    with urllib.request.urlopen(req_unauth) as resp:
        print("UNAUTHORIZED ERROR (unexpected 200)")
except urllib.error.HTTPError as e:
    print("UNAUTHORIZED PROPERLY DENIED! Status:", e.code)

# Test Cross-tenant IDOR request (Beacon user requesting American school photo 8a40ec06-7a91-4e68-9375-d59e312762f9)
url_idor = "http://127.0.0.1:8000/api/storage/files/student-photos/8a40ec06-7a91-4e68-9375-d59e312762f9/student_photo.png"
req_idor = urllib.request.Request(url_idor, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req_idor) as resp:
        print("IDOR ERROR (unexpected 200)")
except urllib.error.HTTPError as e:
    print("CROSS-TENANT IDOR PROPERLY DENIED! Status:", e.code)

# Test Path Traversal request
url_trav = "http://127.0.0.1:8000/api/storage/files/student-photos/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8/../../../../etc/passwd"
req_trav = urllib.request.Request(url_trav, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req_trav) as resp:
        print("TRAVERSAL ERROR (unexpected 200)")
except urllib.error.HTTPError as e:
    print("PATH TRAVERSAL PROPERLY DENIED! Status:", e.code)
