#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19N: Production Credential Lifecycle Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Live Secret Lifecycle & Storage Hardening (Values Redacted)
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 19N: Production Credential Lifecycle Hardening          "
echo "================================================================="

# Ensure root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Mapping Active Runtime Secrets in altrix_backend (Values REDACTED)..."
echo "--- ACTIVE RUNTIME CREDENTIALS ---"
docker inspect altrix_backend --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= '{
    var=$1;
    if (var ~ /(DATABASE_URL|SECRET_KEY|SUPABASE|GEMINI|AI_API_KEY|TOKEN|KEY|PASSWORD|AUTH)/) {
        print "SECRET: " var " | CONSUMER: altrix_backend (FastAPI) | VALUE: [REDACTED]";
    }
}' | sort -u || echo "No matching environment variables"

echo ""
echo "[+] 2. Auditing Production Secret Storage Permissions..."
# Audit any .env or config files in /home/altrixadmin, /root, /etc/altrix
find /etc/altrix /root /home/altrixadmin -maxdepth 3 -type f -name "*.env*" -exec ls -la {} + 2>/dev/null || echo "No standalone .env files found in audited directories."

# Ensure /etc/altrix is 700 root:root if it exists
if [ -d /etc/altrix ]; then
    chmod 700 /etc/altrix
    chown root:root /etc/altrix
    echo "    Secured /etc/altrix permissions (700 root:root)."
fi

# Ensure /var/backups/altrix is 700 root:root
if [ -d /var/backups/altrix ]; then
    chmod 700 /var/backups/altrix
    chown root:root /var/backups/altrix
    chmod 600 /var/backups/altrix/* 2>/dev/null || true
    echo "    Secured /var/backups/altrix permissions (700 root:root, files 600)."
fi

echo ""
echo "[+] 3. Performing Comprehensive Filesystem Secret Leakage Sweep..."
LEAKS_FOUND=$(find /root /etc /opt /home /var/log /var/backups /tmp /var/tmp -maxdepth 4 -type f \
    -not -path "*/.git/*" \
    -not -path "/var/log/journal/*" \
    -not -path "/var/backups/altrix/*" \
    -not -path "/root/.ssh/*" \
    -not -path "/home/altrixadmin/.ssh/*" \
    -exec grep -lE '(BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|eyJhbGciOi)' {} + 2>/dev/null || true)

if [ -z "$LEAKS_FOUND" ]; then
    echo "    [PASS] Zero plaintext private keys or JWT tokens found in audited paths."
else
    echo "    [WARN] Files requiring inspection: $LEAKS_FOUND"
fi

echo ""
echo "[+] 4. Verifying Git Tracking & Exclusion Rules..."
if [ -d /home/altrixadmin/Altrix/.git ]; then
    TRACKED_ENV=$(git -C /home/altrixadmin/Altrix ls-files | grep -E '(\.env|secret|key|cert)' || true)
    if [ -z "$TRACKED_ENV" ]; then
        echo "    [PASS] Zero secret or environment files are tracked in Git."
    else
        echo "    [WARN] Tracked sensitive files in Git: $TRACKED_ENV"
    fi
else
    echo "    [PASS] No local git repository root on host filesystem."
fi

echo ""
echo "[+] 5. Enforcing Forensic Sanitization & Safe Docker Inspection Standards..."
# Verify that backup scripts do not capture raw docker inspect env dumps
grep -rn "docker inspect" /usr/local/bin/ /etc/systemd/system/ 2>/dev/null || echo "    [PASS] Backup and systemd services do not perform unsanitized docker inspect."

echo ""
echo "[+] 6. Production Health & Regression Verification..."
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
echo "  PHASE 19N COMPLETE: CREDENTIAL LIFECYCLE HARDENED              "
echo "================================================================="
