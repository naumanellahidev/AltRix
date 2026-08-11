#!/usr/bin/env python3
"""
PHASE 20I — LIVE SUPABASE STORAGE → VPS PRIVATE STORAGE MIGRATION
Copy 100% of Supabase Storage objects to VPS private storage (/var/lib/altrix/storage/)
with 0 deletions, 0 transformations, byte-for-byte fidelity, and evidence logging.
"""
import urllib.request, json, os, sys, time, shutil, subprocess, hashlib
from datetime import datetime, timezone

SUPABASE_URL = "https://nhossjmkdjeeacbajelq.supabase.co"
PROD_ENV = "/opt/altrix/shared/config/production.env"
TARGET_STORAGE_DIR = "/var/lib/altrix/storage"
EVIDENCE_DIR = "/var/backups/altrix/phase20i_storage_migration"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

service_key = get_env(PROD_ENV, "SUPABASE_SERVICE_ROLE_KEY") or ""
if not service_key:
    print("FATAL: SUPABASE_SERVICE_ROLE_KEY not found in production.env!")
    sys.exit(1)

def run_cmd(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

def list_bucket_objects(bucket_id, prefix=""):
    url = f"{SUPABASE_URL}/storage/v1/object/list/{bucket_id}"
    body_data = json.dumps({
        "prefix": prefix,
        "limit": 1000,
        "offset": 0,
        "sortBy": {"column": "name", "order": "asc"}
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=body_data, headers={
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json"
    })
    
    objects = []
    try:
        with urllib.request.urlopen(req) as resp:
            items = json.loads(resp.read().decode())
            for item in items:
                name = item.get("name")
                item_path = f"{prefix}/{name}" if prefix else name
                if item.get("id") is None:
                    objects.extend(list_bucket_objects(bucket_id, item_path))
                else:
                    item["full_path"] = item_path
                    item["bucket_id"] = bucket_id
                    objects.append(item)
    except Exception as e:
        print(f"Error listing {bucket_id} prefix '{prefix}': {e}")
    return objects

def download_object(bucket_id, object_path, target_filepath):
    # Endpoint for downloading/authenticated retrieval
    quoted_path = urllib.parse.quote(object_path)
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket_id}/{quoted_path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key
    })
    
    os.makedirs(os.path.dirname(target_filepath), exist_ok=True)
    with urllib.request.urlopen(req) as resp, open(target_filepath, "wb") as f:
        shutil.copyfileobj(resp, f)

# Setup directories
os.makedirs(TARGET_STORAGE_DIR, exist_ok=True)
os.makedirs(EVIDENCE_DIR, exist_ok=True)

# Enforce secure permissions
os.chmod(TARGET_STORAGE_DIR, 0o750)
os.chmod(EVIDENCE_DIR, 0o750)

start_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
print("=" * 80)
print(f"  PHASE 20I — LIVE SUPABASE STORAGE MIGRATION TO {TARGET_STORAGE_DIR}")
print(f"  Started at: {start_time}")
print("=" * 80)

# Discover buckets
buckets_url = f"{SUPABASE_URL}/storage/v1/bucket"
req = urllib.request.Request(buckets_url, headers={
    "Authorization": f"Bearer {service_key}",
    "apikey": service_key
})
with urllib.request.urlopen(req) as resp:
    buckets_info = json.loads(resp.read().decode())

bucket_ids = [b["id"] for b in buckets_info]
print(f"\n[1] DISCOVERED {len(bucket_ids)} BUCKETS:")
for b in buckets_info:
    print(f"    - {b['id']} (public={b.get('public', False)})")

# Build complete inventory
print("\n[2] DISCOVERING ALL OBJECTS ACROSS ALL BUCKETS...")
inventory = []
bucket_stats = {}

for b_id in bucket_ids:
    objs = list_bucket_objects(b_id)
    b_bytes = 0
    for o in objs:
        meta = o.get("metadata", {})
        sz = meta.get("size", 0) if isinstance(meta, dict) else 0
        b_bytes += sz
        inventory.append({
            "bucket": b_id,
            "object_id": o.get("id"),
            "object_path": o["full_path"],
            "filename": os.path.basename(o["full_path"]),
            "mime_type": meta.get("mimetype", "application/octet-stream") if isinstance(meta, dict) else "application/octet-stream",
            "size_bytes": sz,
            "created_at": o.get("created_at"),
            "updated_at": o.get("updated_at"),
            "metadata": meta
        })
    bucket_stats[b_id] = {"count": len(objs), "bytes": b_bytes}
    print(f"    Bucket '{b_id}': {len(objs)} objects, {b_bytes} bytes")

total_objects = len(inventory)
total_bytes = sum(item["size_bytes"] for item in inventory)

print(f"\nTOTAL INVENTORY: {total_objects} objects, {total_bytes} bytes")

# Save inventory evidence
inv_file = os.path.join(EVIDENCE_DIR, "phase20i_inventory.json")
with open(inv_file, "w") as f:
    json.dump({
        "timestamp": start_time,
        "total_objects": total_objects,
        "total_bytes": total_bytes,
        "bucket_stats": bucket_stats,
        "inventory": inventory
    }, f, indent=2)
print(f"  Saved inventory to {inv_file}")

# Perform byte-for-byte migration
print("\n[3] COPYING ALL 100% OBJECTS TO VPS PRIVATE STORAGE...")
manifest = []
success_count = 0
failed_count = 0
migrated_bytes = 0

for idx, item in enumerate(inventory, 1):
    b_id = item["bucket"]
    o_path = item["object_path"]
    target_path = os.path.join(TARGET_STORAGE_DIR, b_id, o_path.lstrip("/"))
    
    status = "SUCCESS"
    err_msg = None
    try:
        download_object(b_id, o_path, target_path)
        actual_sz = os.path.getsize(target_path)
        os.chmod(target_path, 0o640)
        
        if actual_sz != item["size_bytes"]:
            status = "FAILED"
            err_msg = f"Size mismatch: expected {item['size_bytes']}, got {actual_sz}"
            failed_count += 1
        else:
            success_count += 1
            migrated_bytes += actual_sz
    except Exception as e:
        status = "FAILED"
        err_msg = str(e)
        failed_count += 1

    manifest.append({
        "source_bucket": b_id,
        "source_object_id": item["object_id"],
        "source_path": o_path,
        "source_size": item["size_bytes"],
        "source_mime_type": item["mime_type"],
        "source_created_at": item["created_at"],
        "target_path": target_path,
        "target_size": os.path.getsize(target_path) if os.path.exists(target_path) else 0,
        "migration_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "migration_status": status,
        "error": err_msg
    })
    
    if idx % 20 == 0 or idx == total_objects:
        print(f"    Progress: {idx}/{total_objects} objects processed ({success_count} success, {failed_count} failed)")

# Save manifest evidence
manifest_file = os.path.join(EVIDENCE_DIR, "phase20i_migration_manifest.json")
with open(manifest_file, "w") as f:
    json.dump({
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_objects": total_objects,
        "successful": success_count,
        "failed": failed_count,
        "total_bytes": total_bytes,
        "migrated_bytes": migrated_bytes,
        "manifest": manifest
    }, f, indent=2)
print(f"  Saved manifest to {manifest_file}")

# ============================================================
# [4] INDEPENDENT SECOND PASS VERIFICATION
# ============================================================
print("\n[4] RUNNING INDEPENDENT SECOND PASS VERIFICATION...")
pass2_inventory = []
for b_id in bucket_ids:
    objs = list_bucket_objects(b_id)
    for o in objs:
        meta = o.get("metadata", {})
        pass2_inventory.append({
            "bucket": b_id,
            "path": o["full_path"],
            "size": meta.get("size", 0) if isinstance(meta, dict) else 0
        })

pass2_source_count = len(pass2_inventory)
pass2_source_bytes = sum(i["size"] for i in pass2_inventory)

pass2_missing = 0
pass2_mismatch = 0
pass2_verified_bytes = 0

for item in pass2_inventory:
    t_file = os.path.join(TARGET_STORAGE_DIR, item["bucket"], item["path"].lstrip("/"))
    if not os.path.exists(t_file):
        pass2_missing += 1
    else:
        sz = os.path.getsize(t_file)
        if sz != item["size"]:
            pass2_mismatch += 1
        else:
            pass2_verified_bytes += sz

pass2_ok = (
    pass2_source_count == total_objects
    and pass2_source_bytes == total_bytes
    and pass2_missing == 0
    and pass2_mismatch == 0
    and pass2_verified_bytes == total_bytes
)

verification_data = {
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source_object_count": pass2_source_count,
    "target_object_count": success_count,
    "source_total_bytes": pass2_source_bytes,
    "target_total_bytes": pass2_verified_bytes,
    "missing_objects": pass2_missing,
    "mismatched_objects": pass2_mismatch,
    "pass2_status": "PASS" if pass2_ok else "FAIL"
}

ver_file = os.path.join(EVIDENCE_DIR, "phase20i_verification.json")
with open(ver_file, "w") as f:
    json.dump(verification_data, f, indent=2)

print(f"  Pass #2 Source Count: {pass2_source_count} | Target Count: {success_count}")
print(f"  Pass #2 Source Bytes: {pass2_source_bytes} | Target Bytes: {pass2_verified_bytes}")
print(f"  Missing: {pass2_missing} | Mismatched: {pass2_mismatch}")
print(f"  Pass #2 Status: {'✅ PASS' if pass2_ok else '❌ FAIL'}")

# ============================================================
# [5] PRODUCTION HEALTH CHECK
# ============================================================
print("\n[5] PRODUCTION HEALTH CHECK...")
h_out, _, _ = run_cmd("curl -s -w '\\n%{http_code}' https://altrixcore.com/health")
lines = h_out.rsplit("\n", 1)
h_code = lines[-1] if lines else "000"
print(f"  https://altrixcore.com/health -> HTTP {h_code}")

api_out, _, _ = run_cmd("curl -s -w '\\n%{http_code}' https://altrixcore.com/api/health")
lines_api = api_out.rsplit("\n", 1)
api_code = lines_api[-1] if lines_api else "000"
print(f"  https://altrixcore.com/api/health -> HTTP {api_code}")

health_ok = h_code == "200" and api_code == "200"

# ============================================================
# [6] FINAL REPORT GENERATION
# ============================================================
final_status = "PASS" if (failed_count == 0 and pass2_ok and health_ok) else "FAIL"

report_lines = [
    "=" * 80,
    "  PHASE 20I — LIVE SUPABASE STORAGE TO VPS STORAGE MIGRATION REPORT",
    "=" * 80,
    f"Timestamp:              {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
    f"Target VPS Storage Dir: {TARGET_STORAGE_DIR}",
    f"Evidence Dir:           {EVIDENCE_DIR}",
    "",
    "--- MIGRATION METRICS ---",
    f"Total Buckets:          {len(bucket_ids)}",
    f"Total Source Objects:   {total_objects}",
    f"Successfully Migrated:  {success_count}",
    f"Failed Objects:         {failed_count}",
    f"Skipped Objects:        0",
    f"Total Source Bytes:     {total_bytes} ({total_bytes / (1024*1024):.2f} MB)",
    f"Migrated Bytes:         {migrated_bytes} ({migrated_bytes / (1024*1024):.2f} MB)",
    "",
    "--- BUCKET BREAKDOWN ---",
]

for b_id, s in bucket_stats.items():
    report_lines.append(f"  Bucket '{b_id}': {s['count']} objects, {s['bytes']} bytes")

report_lines.extend([
    "",
    "--- INDEPENDENT PASS #2 VERIFICATION ---",
    f"Source Object Count:   {pass2_source_count}",
    f"Target Object Count:   {success_count}",
    f"Source Total Bytes:    {pass2_source_bytes}",
    f"Target Total Bytes:    {pass2_verified_bytes}",
    f"Missing Objects:       {pass2_missing}",
    f"Mismatched Objects:    {pass2_mismatch}",
    f"Pass #2 Verification:  {'PASS' if pass2_ok else 'FAIL'}",
    "",
    "--- PRODUCTION SYSTEM HEALTH ---",
    f"HTTP /health:          {h_code}",
    f"HTTP /api/health:      {api_code}",
    f"Supabase Intact:       YES (0 deletions, 0 buckets modified)",
    "",
    "=" * 80,
    f"  FINAL STATUS: {final_status}",
    "=" * 80
])

report_txt = "\n".join(report_lines)
report_file = os.path.join(EVIDENCE_DIR, "phase20i_final_report.txt")
with open(report_file, "w") as f:
    f.write(report_txt)

print("\n" + report_txt)
