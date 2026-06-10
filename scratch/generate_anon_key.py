import time
import jwt
import urllib.request
import urllib.error

jwt_secret = "Ns2UVrOSTBj2ik0JiURxp6FGAjqWoia/H/zur7kg4d74mDSGHs9YdhIgDIOjWG0vgZdW0SVpK0irhae70F0GXg=="
project_ref = "nhossjmkdjeeacbajelq"
url = f"https://{project_ref}.supabase.co/rest/v1/"

# JWT payload structure for Supabase anon key
payload = {
    "iss": "supabase",
    "ref": project_ref,
    "role": "anon",
    "iat": int(time.time()),
    "exp": int(time.time()) + (100 * 365 * 24 * 60 * 60) # 100 years
}

def verify_token(token):
    req = urllib.request.Request(
        url,
        headers={
            "apikey": token,
            "Authorization": f"Bearer {token}"
        },
        method="GET"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"API query succeeded! Status: {resp.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"API query returned status {e.code}: {e.read().decode()}")
        # 404 or 200 or 406 means the key is VALID (authenticated but route/parameters mismatch)
        # 401/403 means authentication failed (invalid key or signature)
        if e.code not in [401, 403]:
            return True
        return False
    except Exception as e:
        print(f"Failed: {e}")
        return False

# Generate and test token
token = jwt.encode(payload, jwt_secret, algorithm="HS256")
print(f"Generated Token: {token}")

success = verify_token(token)
if success:
    print("SUCCESS: The generated Anon key is 100% valid!")
else:
    print("FAILED: Verification failed.")
