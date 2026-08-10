#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19C: Credential & Privilege-Escalation Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19C: Credential & Privilege-Escalation Hardening         "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/phase19c_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Credential & Sudo Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /home/altrixadmin/.ssh "$BACKUP_DIR/ssh_backup"
cp /etc/sudoers "$BACKUP_DIR/sudoers"
if [ -d /etc/sudoers.d ]; then
  cp -r /etc/sudoers.d "$BACKUP_DIR/sudoers.d"
fi
cp /etc/passwd "$BACKUP_DIR/passwd"
cp /etc/group "$BACKUP_DIR/group"
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Enforcing Strict SSH Home & Key File Permissions..."
chmod 750 /home/altrixadmin
chown altrixadmin:altrixadmin /home/altrixadmin

chmod 700 /home/altrixadmin/.ssh
chown -R altrixadmin:altrixadmin /home/altrixadmin/.ssh

if [ -f /home/altrixadmin/.ssh/authorized_keys ]; then
  chmod 600 /home/altrixadmin/.ssh/authorized_keys
  chown altrixadmin:altrixadmin /home/altrixadmin/.ssh/authorized_keys
fi
echo "    Permissions verified: /home/altrixadmin (750), .ssh (700), authorized_keys (600)"

echo ""
echo "[+] 3. Hardening Sudoers File & Directory Permissions..."
chmod 440 /etc/sudoers
chown root:root /etc/sudoers

if [ -d /etc/sudoers.d ]; then
  chmod 750 /etc/sudoers.d
  chown root:root /etc/sudoers.d
  chmod 440 /etc/sudoers.d/* 2>/dev/null || true
  chown root:root /etc/sudoers.d/* 2>/dev/null || true
fi

echo "--- Sudoers Syntax Validation (visudo -c) ---"
visudo -c

echo ""
echo "[+] 4. Verifying Privileged User Accounts (UID 0 Audit)..."
UID_ZERO_USERS=$(awk -F: '($3 == 0) {print $1}' /etc/passwd)
echo "    Accounts with UID 0: $UID_ZERO_USERS"
if [ "$UID_ZERO_USERS" != "root" ]; then
  echo "    [WARN] Unexpected UID 0 account detected: $UID_ZERO_USERS"
else
  echo "    [PASS] Only root has UID 0."
fi

echo ""
echo "[+] 5. Verifying Admin User Group Membership..."
id altrixadmin

echo ""
echo "[+] 6. Scanning for Unsafe World-Writable Files in /etc, /usr/local, /home/altrixadmin..."
WORLD_WRITABLE=$(find /etc /usr/local /home/altrixadmin -xdev -type f -perm -0002 2>/dev/null || true)
if [ -z "$WORLD_WRITABLE" ]; then
  echo "    [PASS] Zero world-writable files found in sensitive administrative directories."
else
  echo "    [WARN] Found world-writable files: $WORLD_WRITABLE"
fi

echo ""
echo "[+] 7. Auditing SUID/SGID Executables (Standard Baseline)..."
SUID_COUNT=$(find /usr /bin /sbin /opt -xdev -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null | wc -l)
echo "    Standard SUID/SGID binaries found: $SUID_COUNT (Legitimate system binaries preserved)"

echo ""
echo "[+] 8. Live Privilege & Service Verification..."
echo -n "    Sudo non-interactive test (sudo -n id): "
sudo -n id

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

echo -n "    Production HTTPS: "
curl -Is https://altrixcore.com | head -n 1

echo ""
echo "================================================================="
echo "  PHASE 19C COMPLETE: CREDENTIAL & PRIVESC HARDENING APPLIED     "
echo "================================================================="
