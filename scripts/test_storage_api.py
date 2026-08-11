import urllib.request, json

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/login',
    data=json.dumps({'email':'beaconryk@gmail.com','password':'Beacon@12345'}).encode(),
    headers={'Content-Type':'application/json'}
)
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode())['access_token']

print('Obtained Token:', token[:30] + '...')

url = 'http://127.0.0.1:8000/api/storage/files/student-photos/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8/d47a671d-695b-40df-aa4c-9596cb6c413c_1781261710107.png'
req2 = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})

try:
    with urllib.request.urlopen(req2) as resp2:
        print('HTTP STATUS:', resp2.status)
        print('HEADERS:', dict(resp2.headers))
        print('BYTES READ:', len(resp2.read()))
except Exception as e:
    print('ERROR:', e)
