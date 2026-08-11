#!/usr/bin/env python3
import urllib.request, json, os, subprocess

SUPABASE_URL = "https://nhossjmkdjeeacbajelq.supabase.co"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

service_key = get_env(PROD_ENV, "SUPABASE_SERVICE_ROLE_KEY") or ""
admin_pass = get_env(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or ""

print("=== 1. SUPABASE STORAGE BUCKETS VIA API ===")
req = urllib.request.Request(f"{SUPABASE_URL}/storage/v1/bucket", headers={
    "Authorization": f"Bearer {service_key}",
    "apikey": service_key
})
try:
    with urllib.request.urlopen(req) as resp:
        buckets = json.loads(resp.read().decode())
        print(f"Discovered {len(buckets)} bucket(s):")
        for b in buckets:
            print(f"  Bucket: id={b.get('id')}, name={b.get('name')}, public={b.get('public')}")
except Exception as e:
    print(f"Error querying buckets API: {e}")

print("\n=== 2. STORAGE OBJECTS VIA VPS POSTGRESQL (storage.objects & storage.buckets) ===")
env = dict(os.environ, PGPASSWORD=admin_pass)
def psql(sql):
    r = subprocess.run(["psql","-h","127.0.0.1","-p","5432","-U","altrix_admin","-d","altrix","-c",sql],
                       env=env, capture_output=True, text=True)
    return r.stdout.strip()

print("Buckets in DB:")
print(psql("SELECT id, name, public FROM storage.buckets;"))

print("\nObjects count in DB per bucket:")
print(psql("SELECT bucket_id, count(*), sum(COALESCE((metadata->>'size')::bigint, 0)) as total_bytes FROM storage.objects GROUP BY bucket_id;"))

print("\nSample objects in DB:")
print(psql("SELECT id, bucket_id, name, metadata->>'mimetype' as mime, metadata->>'size' as size, created_at FROM storage.objects LIMIT 20;"))
