#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19M: Secrets Inventory & Exposure Assessment
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Live Metadata-Only Assessment (Values Redacted)
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 19M: Secrets Inventory & Credential Lifecycle Audit     "
echo "================================================================="

echo "[+] 1. Inspecting Live Secret Consumers & Runtime Bindings..."
# Check container env variable presence (names only)
sudo docker inspect altrix_backend --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= '{print "VARIABLE_NAME: " $1 " / CONSUMER: altrix_backend (FastAPI) / STATUS: ACTIVE / VALUE: [REDACTED]"}' | grep -E '(DATABASE_URL|SECRET_KEY|SUPABASE|GEMINI|AI_API_KEY|TOKEN|KEY)' || echo "No matching variables found"

echo ""
echo "[+] 2. Checking Active .env File Locations and Permissions..."
find /etc/altrix /root /home/altrixadmin -name "*.env" -exec ls -la {} + 2>/dev/null || echo "No .env files in standard paths"

echo ""
echo "[+] 3. Scanning for Sensitive Remnants in System Logs and Temp..."
find /var/log /tmp /var/tmp /root /home/altrixadmin -maxdepth 4 -type f -not -path "*/.git/*" -not -path "/var/log/journal/*" -exec grep -lE '(BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|eyJhbGciOi)' {} + 2>/dev/null || echo "[PASS] No exposed private keys or JWT tokens in system log/tmp paths"

echo ""
echo "[+] 4. Verifying Git Index on VPS..."
if [ -d /home/altrixadmin/Altrix/.git ] || [ -d /home/altrixadmin/.git ]; then
    echo "    Git status on VPS repository:"
    git -C /home/altrixadmin/Altrix status --porcelain 2>/dev/null || echo "    Git directory clean/untracked."
else
    echo "    [PASS] No local git tracking on production filesystem root."
fi

echo ""
echo "[+] 5. Production Health & Regression Verification..."
echo -n "    SSH daemon: "
systemctl is-active ssh

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo -n "    Docker daemon: "
systemctl is-active docker

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx

echo -n "    AltRix Backend Container: "
docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})' || echo "N/A"

echo -n "    Port 8000 binding: "
ss -lnt | grep ":8000" || echo "Not listening"

echo -n "    Production HTTPS (/): "
curl -Is https://altrixcore.com | head -n 1

echo -n "    Production Health (/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health

echo -n "    Production API Health (/api/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 19M INVENTORY COMPLETE                                  "
echo "================================================================="
