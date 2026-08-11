import urllib.request, base64, hmac, hashlib, json

jwt_secret = 'Ns2UVrOSTBj2ik0JiURxp6FGAjqWoia/H/zur7kg4d74mDSGHs9YdhIgDIOjWG0vgZdW0SVpK0irhae70F0GXg=='
def create_jwt(payload, secret):
    header = {'alg': 'HS256', 'typ': 'JWT'}
    b64_hdr = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    b64_pay = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    sig_input = f'{b64_hdr}.{b64_pay}'.encode()
    sig = hmac.new(secret.encode(), sig_input, hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(sig).decode().rstrip('=')
    return f'{b64_hdr}.{b64_pay}.{b64_sig}'

token = create_jwt({'sub':'3f8865d8-c619-4737-84c9-034849a8a349','email':'owner@beacon.com','role':'authenticated','aud':'authenticated'}, jwt_secret)

url_local = 'http://127.0.0.1:8000/api/storage/files/student-photos/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8/d47a671d-695b-40df-aa4c-9596cb6c413c_1781261710107.png'
req = urllib.request.Request(url_local, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(req) as resp:
        print('LOCAL HTTP TEST:', resp.status, len(resp.read()))
except Exception as e:
    print('LOCAL ERROR:', e)

url_nginx = 'https://altrixcore.com/api/storage/files/student-photos/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8/d47a671d-695b-40df-aa4c-9596cb6c413c_1781261710107.png'
req_n = urllib.request.Request(url_nginx, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(req_n) as resp:
        print('NGINX HTTPS TEST:', resp.status, len(resp.read()))
except Exception as e:
    print('NGINX ERROR:', e)
