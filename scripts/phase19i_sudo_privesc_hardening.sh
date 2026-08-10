#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19I: Sudo & Privilege-Escalation Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19I: Sudo & Privilege-Escalation Hardening               "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/sudo_phase19i_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Sudo Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp /etc/sudoers "$BACKUP_DIR/sudoers"
if [ -d /etc/sudoers.d ]; then
  cp -r /etc/sudoers.d "$BACKUP_DIR/sudoers.d"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Deploying Sudo Security Defaults Drop-in..."
TEMP_SUDO_CONF=$(mktemp)

cat << 'EOF' > "$TEMP_SUDO_CONF"
# ==============================================================================
# AltRix Production Sudo Security Defaults - Phase 19I
# ==============================================================================

# Reset environment variables to safe defaults
Defaults env_reset

# Enforce secure system PATH for all privileged executions
Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"

# Allocate dedicated pseudoterminal for sudo commands (prevents background hijack)
Defaults use_pty

# Log sudo executions securely
Defaults loglinelen=0
Defaults logfile="/var/log/sudo.log"

# Mail alerts on failed authentication attempts
Defaults mail_badpass
EOF

chmod 440 "$TEMP_SUDO_CONF"
chown root:root "$TEMP_SUDO_CONF"

echo "    Validating drop-in syntax with visudo..."
if visudo -c -f "$TEMP_SUDO_CONF"; then
  mv "$TEMP_SUDO_CONF" /etc/sudoers.d/00_altrix_sudo_security
  chmod 440 /etc/sudoers.d/00_altrix_sudo_security
  chown root:root /etc/sudoers.d/00_altrix_sudo_security
  echo "    Installed /etc/sudoers.d/00_altrix_sudo_security"
else
  echo "[-] Sudoers syntax validation FAILED! Rolling back..."
  rm -f "$TEMP_SUDO_CONF"
  exit 1
fi

echo ""
echo "[+] 3. Enforcing Strict Sudoers Permissions..."
chmod 440 /etc/sudoers
chown root:root /etc/sudoers

chmod 750 /etc/sudoers.d
chown root:root /etc/sudoers.d
chmod 440 /etc/sudoers.d/* 2>/dev/null || true
chown root:root /etc/sudoers.d/* 2>/dev/null || true

echo "--- Sudoers Global Syntax Verification (visudo -c) ---"
visudo -c

echo ""
echo "[+] 4. Verifying Administrative Privilege (sudo -n id)..."
sudo -n id

echo ""
echo "[+] 5. Scanning Sensitive Paths for Unsafe World-Writable Files..."
WORLD_WRITABLE=$(find /etc /usr/local /home/altrixadmin -xdev -type f -perm -0002 2>/dev/null || true)
if [ -z "$WORLD_WRITABLE" ]; then
  echo "    [PASS] Zero world-writable files detected in administrative directories."
else
  echo "    [WARN] World-writable files detected: $WORLD_WRITABLE"
fi

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

echo -n "    Production HTTPS (/): "
curl -Is https://altrixcore.com | head -n 1

echo -n "    Production Health (/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health

echo -n "    Production API Health (/api/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 19I COMPLETE: SUDO SECURITY HARDENING APPLIED            "
echo "================================================================="
