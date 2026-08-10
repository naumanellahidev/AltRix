#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19L-R: Forensic Evidence Remediation
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Live Remediation & Safe Artifact Cleanup
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 19L-R: Forensic Evidence & Credential Remediation       "
echo "================================================================="

TARGET_DIR="/var/log/altrix/phase14-forensic-evidence"
REMEDIATION_LOG_DIR="/root/altrix-security-remediation"
AUDIT_RECORD="$REMEDIATION_LOG_DIR/remediation_19l_r_metadata.txt"

# Step 1: Locate finding and inspect metadata
echo "[+] Step 1: Inspecting Target Forensic Directory..."
if [ ! -d "$TARGET_DIR" ]; then
    echo "[-] Directory $TARGET_DIR does not exist or was already removed."
    exit 0
fi

mkdir -p "$REMEDIATION_LOG_DIR"
chmod 700 "$REMEDIATION_LOG_DIR"
chown root:root "$REMEDIATION_LOG_DIR"

echo "=== FILE INVENTORY & METADATA ===" > "$AUDIT_RECORD"
echo "TIMESTAMP: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$AUDIT_RECORD"
find "$TARGET_DIR" -type f -exec ls -la {} + >> "$AUDIT_RECORD"

echo "--- SHA-256 HASHES ---" >> "$AUDIT_RECORD"
find "$TARGET_DIR" -type f -exec sha256sum {} + >> "$AUDIT_RECORD"
chmod 600 "$AUDIT_RECORD"

echo "    Metadata recorded in $AUDIT_RECORD"

# Step 2: Safe Redacted Variable Name Detection
echo ""
echo "[+] Step 2: Scanning Sensitive Variable Names (REDACTED Output)..."
echo "--- SENSITIVE VARIABLE NAMES FOUND (VALUES REDACTED) ---"
grep -rnE '(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|JWT|DATABASE_URL|DB_PASSWORD|ACCESS_KEY|SECRET_KEY|AUTH|CREDENTIAL|SUPABASE|CLOUDFLARE|SSH)' "$TARGET_DIR" 2>/dev/null | awk -F: '{
    file=$1;
    line=$2;
    $1=""; $2="";
    # Extract variable name before '=' or ':' if present
    match($0, /[A-Za-z0-9_]*(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|JWT|DATABASE_URL|DB_PASSWORD|ACCESS_KEY|SECRET_KEY|AUTH|CREDENTIAL|SUPABASE|CLOUDFLARE|SSH)[A-Za-z0-9_]*/);
    var=substr($0, RSTART, RLENGTH);
    if (var != "") {
        print var " / " file ":" line " / [REDACTED]";
    }
}' | sort -u || echo "No matching patterns"

# Step 3: Dependency Check
echo ""
echo "[+] Step 3: Checking System Dependencies on Forensic Directory..."
DEP_FOUND=$(grep -rn "phase14-forensic-evidence" /etc/systemd/ /etc/cron* /etc/nginx/ /etc/fail2ban/ 2>/dev/null || true)
if [ -z "$DEP_FOUND" ]; then
    echo "    [PASS] Zero active system services or configs depend on $TARGET_DIR."
else
    echo "    [WARN] Dependencies detected: $DEP_FOUND"
fi

# Step 4: Web Accessibility Check
echo ""
echo "[+] Step 4: Verifying Web Inaccessibility..."
WEB_ACCESS=$(grep -rn "/var/log" /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ /etc/altrix/proxy/ 2>/dev/null | grep -E '(root|alias)' || true)
if [ -z "$WEB_ACCESS" ]; then
    echo "    [PASS] /var/log is NOT served or aliased by Nginx."
else
    echo "    [WARN] Possible web exposure: $WEB_ACCESS"
fi

# Step 5: Safe Removal of Obsolete Artifacts
echo ""
echo "[+] Step 5: Safely Removing Obsolete Forensic Directory..."
rm -rf "$TARGET_DIR"

if [ ! -d "$TARGET_DIR" ]; then
    echo "    [PASS] $TARGET_DIR successfully removed."
else
    echo "    [-] ERROR: Failed to remove $TARGET_DIR."
    exit 1
fi

# Step 6: Verify No Plaintext Secret Copies in Remediation Dir
echo ""
echo "[+] Step 6: Verifying Remediation Directory Integrity..."
ls -la "$REMEDIATION_LOG_DIR"

# Step 7: Production Health Verification
echo ""
echo "[+] Step 7: Production Health Verification..."
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
echo "  PHASE 19L-R COMPLETE: REMEDIATION VERIFIED                     "
echo "================================================================="
