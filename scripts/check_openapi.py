import json, urllib.request

with urllib.request.urlopen('http://127.0.0.1:8000/openapi.json') as resp:
    d = json.loads(resp.read())
    print("All Registered Paths in FastAPI:")
    for path in sorted(d.get('paths', {}).keys()):
        print("  ", path)
