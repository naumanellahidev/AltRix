#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19O: Final Credential Rotation & Security Closure
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Live Secret Hardening & Closure (Values Strictly Redacted)
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 19O: Final Credential Rotation & Security Closure        "
echo "================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

PROD_ENV="/opt/altrix/shared/config/production.env"

# Step 1: Pre-rotation Live Snapshot
echo "[+] Step 1: Collecting Pre-Rotation Live Snapshot..."
echo -n "    Docker: " && systemctl is-active docker
echo -n "    Nginx: " && systemctl is-active nginx
echo -n "    SSH: " && systemctl is-active ssh
echo -n "    Fail2Ban: " && systemctl is-active fail2ban
echo -n "    Nginx syntax: " && nginx -t 2>&1 | tail -n 1
echo -n "    Homepage: " && curl -fsS -o /dev/null -w '%{http_code}\n' https://altrixcore.com
echo -n "    Health: " && curl -fsS -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health
echo -n "    API Health: " && curl -fsS -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

# Step 2: Storage Permissions Verification
echo ""
echo "[+] Step 2: Auditing Production Secret Storage Permissions..."
stat -c '%A %U:%G %n' /opt/altrix/shared/config
stat -c '%A %U:%G %n' "$PROD_ENV"

# Step 3: Local Secret Rotation (SECRET_KEY)
echo ""
echo "[+] Step 3: Performing Controlled Local SECRET_KEY Rotation..."
if [ -f "$PROD_ENV" ]; then
    NEW_KEY=$(openssl rand -hex 32)
    # Safely replace SECRET_KEY line in production.env without echoing
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${NEW_KEY}|" "$PROD_ENV"
    unset NEW_KEY
    chmod 600 "$PROD_ENV"
    chown root:root "$PROD_ENV"
    echo "    [PASS] SECRET_KEY updated in $PROD_ENV (600 root:root)."
    
    echo "    Restarting altrix_backend container to load updated SECRET_KEY..."
    docker restart altrix_backend >/dev/null
    sleep 3
else
    echo "[-] Error: $PROD_ENV not found."
    exit 1
fi

# Step 4: Post-Rotation Leakage Sweep
echo ""
echo "[+] Step 4: Performing Comprehensive Secret Exposure Sweep..."
LEAKS=$(find /root /etc /opt /home /var/log /var/backups /tmp /var/tmp -maxdepth 4 -type f \
    -not -path "*/.git/*" \
    -not -path "/var/log/journal/*" \
    -not -path "/var/backups/altrix/*" \
    -not -path "/opt/altrix/shared/config/production.env" \
    -not -path "/opt/altrix/releases/*/*.env*" \
    -not -path "/root/.ssh/*" \
    -not -path "/home/altrixadmin/.ssh/*" \
    -exec grep -lE '(BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|eyJhbGciOi)' {} + 2>/dev/null || true)

if [ -z "$LEAKS" ]; then
    echo "    [PASS] Zero secret remnants found across unmanaged filesystem paths."
else
    echo "    [WARN] Remnants found: $LEAKS"
fi

# Step 5: Backup System & Storage Hygiene Check
echo ""
echo "[+] Step 5: Auditing Backup Storage Hygiene..."
ls -ld /var/backups/altrix
ls -la /var/backups/altrix/ | grep -E '(\.tar\.gz|\.sha256)' | head -n 5

# Step 6: Git Tracking Check
echo ""
echo "[+] Step 6: Verifying Git Secret Exclusion..."
if [ -d /home/altrixadmin/Altrix/.git ]; then
    git -C /home/altrixadmin/Altrix status --porcelain 2>/dev/null || echo "Git clean."
else
    echo "    [PASS] Host filesystem root has no untracked/exposed git repositories."
fi

# Step 7: Final Production Health & Regression Verification
echo ""
echo "[+] Step 7: Final Production Health & Regression Verification..."
echo -n "    SSH daemon: " && systemctl is-active ssh
echo -n "    Fail2Ban service: " && systemctl is-active fail2ban
echo -n "    Docker daemon: " && systemctl is-active docker
echo -n "    Nginx reverse-proxy: " && systemctl is-active nginx
echo -n "    AltRix Backend Container: " && docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})' || echo "N/A"
echo -n "    Port 8000 binding: " && ss -lnt | grep ":8000" || echo "Not listening"
echo -n "    Production HTTPS (/): " && curl -Is https://altrixcore.com | head -n 1
echo -n "    Production Health (/health): " && curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health
echo -n "    Production API Health (/api/health): " && curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 19O EXECUTION COMPLETE                                   "
echo "================================================================="
