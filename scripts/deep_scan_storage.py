#!/usr/bin/env python3
import urllib.request, json, os

SUPABASE_URL = "https://nhossjmkdjeeacbajelq.supabase.co"
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
                    # Folder, recurse
                    objects.extend(list_bucket_objects(bucket_id, item_path))
                else:
                    item["full_path"] = item_path
                    item["bucket_id"] = bucket_id
                    objects.append(item)
    except Exception as e:
        print(f"Error listing {bucket_id} prefix '{prefix}': {e}")
    return objects

buckets = [
    "hr-documents", "assignment-submissions", "message-attachments",
    "admission-documents", "fee-payment-proofs", "exam-datesheets",
    "migration-backups", "student-photos", "generated-documents"
]

all_discovered_objects = []
bucket_stats = {}

print("=== DISCOVERING ALL STORAGE OBJECTS IN SUPABASE STORAGE ===")
for b in buckets:
    objs = list_bucket_objects(b)
    total_b_bytes = sum(o.get("metadata", {}).get("size", 0) for o in objs if isinstance(o.get("metadata"), dict))
    bucket_stats[b] = {"count": len(objs), "bytes": total_b_bytes}
    all_discovered_objects.extend(objs)
    print(f"Bucket '{b}': {len(objs)} files, {total_b_bytes} bytes")

print(f"\nTOTAL DISCOVERED OBJECTS: {len(all_discovered_objects)}")
total_bytes = sum(o.get("metadata", {}).get("size", 0) for o in all_discovered_objects if isinstance(o.get("metadata"), dict))
print(f"TOTAL DISCOVERED BYTES:   {total_bytes} bytes")

print("\nSample objects discovered:")
for obj in all_discovered_objects[:10]:
    b = obj['bucket_id']
    p = obj['full_path']
    meta = obj.get('metadata', {})
    sz = meta.get('size', 0) if isinstance(meta, dict) else 0
    mime = meta.get('mimetype', 'unknown') if isinstance(meta, dict) else 'unknown'
    print(f"  [{b}] {p} ({sz} bytes, {mime})")
