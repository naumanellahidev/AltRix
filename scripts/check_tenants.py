import subprocess, os, json

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

admin_pass = get_env(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or ""
env = dict(os.environ, PGPASSWORD=admin_pass)

def psql(sql):
    r = subprocess.run(["psql","-h","127.0.0.1","-p","5432","-U","altrix_admin","-d","altrix","-t","-A","-c",sql],
                       env=env, capture_output=True, text=True)
    return r.stdout.strip()

print("=== SCHOOLS IN DB ===")
print(psql("SELECT id, name, slug FROM public.schools;"))

print("\n=== SAMPLE MANIFEST TENANT ENTRIES ===")
with open("/var/backups/altrix/phase20jkl_storage/phase20j_metadata_manifest.json") as f:
    data = json.load(f)
    for m in data["manifest"][:20]:
        print(f"Bucket: {m['source_bucket']} | Tenant: {m['source_tenant']} | Path: {m['source_path']}")
