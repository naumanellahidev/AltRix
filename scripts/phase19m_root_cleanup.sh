#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19M: Remediation of Root Historical Dumps
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Safe Removal of Obsolete Pre-Phase-16 /root/ Backup Artifacts
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 19M: Cleaning Obsolete Root Backup & Verification Dumps  "
echo "================================================================="

echo "[+] 1. Removing obsolete pre-Phase-16 backup and verification directories in /root/..."
rm -rf /root/altrix-phase*-backup /root/altrix-phase*-forensic-* /root/altrix-security-backup

echo "[+] 2. Re-scanning /root/ for secret-containing files..."
REMNANTS=$(find /root -maxdepth 4 -type f -not -path "/root/.ssh/*" -exec grep -lE '(BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|eyJhbGciOi)' {} + 2>/dev/null || true)
if [ -z "$REMNANTS" ]; then
    echo "    [PASS] Zero secret remnants found in /root/ filesystem."
else
    echo "    [WARN] Remnants found: $REMNANTS"
fi

echo ""
echo "[+] 3. Production Health Verification..."
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

echo -n "    Production HTTPS (/): "
curl -Is https://altrixcore.com | head -n 1

echo -n "    Production Health (/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health

echo -n "    Production API Health (/api/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 19M ROOT CLEANUP COMPLETE                                "
echo "================================================================="
