#!/usr/bin/env python3
"""
Phase 20Y-Z: Fix Docker-to-Host PostgreSQL connectivity.
The container cannot reach PostgreSQL on the host's Docker bridge interface
because iptables INPUT chain drops traffic from Docker subnets.
"""
import subprocess, sys

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("=" * 70)
print("PHASE 20Y-Z: DOCKER-TO-HOST POSTGRESQL CONNECTIVITY FIX")
print("=" * 70)

# 1. Check current iptables INPUT rules affecting port 5432
print("\n[1] Current iptables INPUT rules for port 5432:")
out, _, _ = run("iptables -L INPUT -n -v --line-numbers | head -30")
print(out)

print("\n[2] Check if UFW is active:")
out, _, _ = run("ufw status")
print(f"  {out}")

# 3. Check Docker network bridge interfaces
print("\n[3] Docker bridge interfaces:")
out, _, _ = run("ip addr show | grep -E '(br-|docker0|172\\.1[79]|172\\.20)'")
print(out)

# 4. Test connectivity before fix
print("\n[4] Pre-fix: TCP test from container to 172.19.0.1:5432")
tcp_test = """
import socket
for h in ["172.19.0.1", "172.20.0.1"]:
    s = socket.socket()
    s.settimeout(2)
    r = s.connect_ex((h, 5432))
    print(f"  {h}:5432 -> {'OK' if r==0 else f'FAIL(errno={r})'}")
    s.close()
"""
with open("/tmp/_tcp_pre.py", "w") as f:
    f.write(tcp_test)
subprocess.run("docker cp /tmp/_tcp_pre.py altrix_backend:/tmp/_tcp_pre.py", shell=True, capture_output=True)
out, err, _ = run("docker exec altrix_backend python3 /tmp/_tcp_pre.py")
print(out)

# 5. Add iptables rules to allow Docker subnet traffic to PostgreSQL on port 5432
# This is a targeted, minimal change — only Docker bridge subnets to PG port
print("\n[5] Adding targeted iptables INPUT rules for Docker -> PostgreSQL...")

# Get the Docker network subnets
subnets = []
for net_name in ["altrix_backend_net", "altrix_db_net", "bridge"]:
    out, _, rc = run(f"docker network inspect {net_name} --format '{{{{range .IPAM.Config}}}}{{{{.Subnet}}}}{{{{end}}}}'")
    if rc == 0 and out:
        subnets.append((net_name, out))
        print(f"  Network '{net_name}': subnet {out}")

# Check and add rules
for net_name, subnet in subnets:
    # Check if rule already exists
    check, _, _ = run(f"iptables -C INPUT -s {subnet} -p tcp --dport 5432 -j ACCEPT 2>&1")
    if "No chain" not in check and "Bad rule" not in check and check == "":
        print(f"  Rule already exists for {subnet}")
    else:
        # Insert at top of INPUT chain (before any DROP/REJECT)
        out, err, rc = run(f"iptables -I INPUT 1 -s {subnet} -p tcp --dport 5432 -j ACCEPT -m comment --comment 'Allow Docker {net_name} to PostgreSQL'")
        if rc == 0:
            print(f"  ✅ Added ACCEPT rule: {subnet} -> :5432 ({net_name})")
        else:
            print(f"  ❌ Failed to add rule for {subnet}: {err}")

# Also allow the host's own IP via Docker bridge
out, err, rc = run("iptables -I INPUT 1 -i lo -p tcp --dport 5432 -j ACCEPT -m comment --comment 'Allow localhost to PostgreSQL' 2>&1")
print(f"  Localhost rule: {'added' if rc == 0 else 'exists/skipped'}")

# 6. Also fix pg_hba.conf to allow the host's public IP for local psql testing
print("\n[6] Checking pg_hba.conf for host public IP entry...")
with open("/etc/postgresql/17/main/pg_hba.conf") as f:
    hba = f.read()

if "169.58.111.159" not in hba:
    with open("/etc/postgresql/17/main/pg_hba.conf", "a") as f:
        f.write("\n# Allow host's own public IP (needed for psql via Docker bridge IPs)\n")
        f.write("host    all             all             169.58.111.159/32       scram-sha-256\n")
    print("  Added pg_hba entry for 169.58.111.159/32")
    run("systemctl reload postgresql")
    print("  PostgreSQL reloaded")
else:
    print("  Entry already exists")

# 7. Verify PostgreSQL listen addresses include 172.20.0.1
print("\n[7] Checking PostgreSQL listen_addresses...")
out, _, _ = run("grep listen_addresses /etc/postgresql/17/main/postgresql.conf")
print(f"  {out}")

# Check if 172.20.0.1 is actually bound
out, _, _ = run("ss -tlnp | grep 5432")
print(f"  Actual listeners:\n{out}")

# If 172.20.0.1 not in listeners, check if the IP exists on an interface
out_ip, _, _ = run("ip addr show | grep 172.20.0.1")
if "172.20.0.1" not in out_ip:
    print("  ⚠️  172.20.0.1 not bound to any interface — altrix_db_net gateway may use a different IP")
    # Get the actual gateway
    gw_out, _, _ = run("docker network inspect altrix_db_net --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'")
    print(f"  altrix_db_net actual gateway: {gw_out}")

# 8. Post-fix TCP test
print("\n[8] Post-fix: TCP test from container to 172.19.0.1:5432")
import time
time.sleep(1)
out, err, _ = run("docker exec altrix_backend python3 /tmp/_tcp_pre.py")
print(out)

# 9. Post-fix psql test from container
print("\n[9] Post-fix: psql-like test from container")
db_test = """
import asyncio, os
try:
    import asyncpg
    async def test():
        url = os.environ.get("DATABASE_URL", "")
        url = url.replace("postgresql://", "postgresql://", 1)  # keep as-is for asyncpg
        # asyncpg uses postgresql:// not postgresql+asyncpg://
        conn = await asyncio.wait_for(
            asyncpg.connect(url, timeout=5),
            timeout=8
        )
        row = await conn.fetchrow("SELECT current_user, current_database(), inet_server_addr()::text, inet_server_port()")
        print(f"  CONNECTED: user={row[0]}, db={row[1]}, server={row[2]}:{row[3]}")
        count = await conn.fetchval("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
        print(f"  Public tables accessible: {count}")
        await conn.close()
    asyncio.run(test())
except Exception as e:
    print(f"  FAILED: {type(e).__name__}: {e}")
"""
with open("/tmp/_pg_test.py", "w") as f:
    f.write(db_test)
subprocess.run("docker cp /tmp/_pg_test.py altrix_backend:/tmp/_pg_test.py", shell=True, capture_output=True)
out, err, rc = run("docker exec altrix_backend python3 /tmp/_pg_test.py")
print(out)
if err: print(f"  stderr: {err}")

# 10. Restart container to re-trigger DB initialization
print("\n[10] Restarting altrix_backend to re-trigger database initialization...")
run("docker restart altrix_backend")
time.sleep(15)

# 11. Check container logs after restart
print("\n[11] Container logs after restart:")
out, _, _ = run("docker logs --tail 20 altrix_backend 2>&1")
print(out[:2000])

# 12. Final health check
print("\n[12] Final endpoint health check:")
for url in ["http://127.0.0.1:8000/health", "http://127.0.0.1:8000/api/health", "https://altrixcore.com/health", "https://altrixcore.com/api/health"]:
    out, _, _ = run(f"curl -s -o /dev/null -w '%{{http_code}}' {url}")
    print(f"  {url} -> HTTP {out}")

# Cleanup
run("rm -f /tmp/_tcp_pre.py /tmp/_pg_test.py")

print("\n" + "=" * 70)
print("CONNECTIVITY FIX COMPLETE")
print("=" * 70)
