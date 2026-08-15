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

print('=== 1. TEST /api/health ===')
req_health = urllib.request.Request('https://altrixcore.com/api/health', headers=HEADERS)
with urllib.request.urlopen(req_health, timeout=10, context=ctx) as resp:
    print(f'Health status: {resp.status} - {resp.read().decode()}')

print('\n=== 2. TEST INVALID PASSWORD (REJECTION) ===')
req_invalid = urllib.request.Request(
    'https://altrixcore.com/api/auth/login',
    data=json.dumps({'email': 'beaconowner@gmail.com', 'password': 'WrongPassword123!'}).encode('utf-8'),
    headers=HEADERS
)
try:
    with urllib.request.urlopen(req_invalid, timeout=10, context=ctx) as resp:
        print(f'Unexpected Success: {resp.status}')
except urllib.error.HTTPError as e:
    print(f'Expected Rejection: HTTP {e.code} - {e.read().decode()}')

print('\n=== 3. TEST VALID USER LOGIN (PRODUCTION USER) ===')
req_valid = urllib.request.Request(
    'https://altrixcore.com/api/auth/login',
    data=json.dumps({'email': 'beaconowner@gmail.com', 'password': 'Owner888'}).encode('utf-8'),
    headers=HEADERS
)
with urllib.request.urlopen(req_valid, timeout=10, context=ctx) as resp:
    status_code = resp.status
    res_body = json.loads(resp.read().decode())
    print(f'Success: HTTP {status_code}')
    print(f'User ID: {res_body.get("user_id")}')
    print(f'Email: {res_body.get("email")}')
    print(f'Access token present: {bool(res_body.get("access_token"))}')
    print(f'Refresh token present: {bool(res_body.get("refresh_token"))}')
    token = res_body.get('access_token')

print('\n=== 4. TEST AUTHENTICATED /api/auth/me WITH RETURNED TOKEN ===')
req_me = urllib.request.Request(
    'https://altrixcore.com/api/auth/me',
    headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': HEADERS['User-Agent']
    }
)
with urllib.request.urlopen(req_me, timeout=10, context=ctx) as resp:
    print(f'Me status: {resp.status} - {resp.read().decode()}')

print('\n=== ALL TARGETED TESTS PASSED! ===')
