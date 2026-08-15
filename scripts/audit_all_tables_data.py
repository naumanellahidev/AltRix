import subprocess
import os
import json

env = os.environ.copy()
env['PGPASSWORD'] = '29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f'

out = subprocess.check_output([
    "psql", "-h", "127.0.0.1", "-U", "altrix_app", "-d", "altrix", "-t", "-A", "-F", "|",
    "-c", """
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
    """
], env=env).decode().strip()

tables = [t.strip() for t in out.splitlines() if t.strip()]

print(f"Total public tables found: {len(tables)}\n")

results = []
for t in tables:
    try:
        cnt_out = subprocess.check_output([
            "psql", "-h", "127.0.0.1", "-U", "altrix_app", "-d", "altrix", "-t", "-A",
            "-c", f'SELECT count(*) FROM public."{t}";'
        ], env=env).decode().strip()
        cnt = int(cnt_out)
        results.append((t, cnt, "OK"))
    except Exception as e:
        results.append((t, -1, str(e)))

# Sort by count descending, then name
results.sort(key=lambda x: (-x[1], x[0]))

print(f"{'TABLE NAME':<40} | {'ROW COUNT':<10} | {'STATUS'}")
print("-" * 65)
populated_count = 0
empty_count = 0
error_count = 0

for t, cnt, status in results:
    if cnt > 0:
        populated_count += 1
        print(f"{t:<40} | {cnt:<10} | {status}")
    elif cnt == 0:
        empty_count += 1
    else:
        error_count += 1
        print(f"{t:<40} | {'ERROR':<10} | {status}")

print("-" * 65)
print(f"Summary: {len(tables)} Total Tables | {populated_count} Populated | {empty_count} Zero-Row (Ready/Clean) | {error_count} Errors")
