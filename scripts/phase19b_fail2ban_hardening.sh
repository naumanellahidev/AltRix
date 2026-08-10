#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19B: SSH Brute-Force & Fail2Ban Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19B: SSH Brute-Force & Fail2Ban Hardening                "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/fail2ban_phase19b_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Fail2Ban Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/fail2ban "$BACKUP_DIR/"
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Deploying Dedicated SSH Fail2Ban Hardening Override..."
CONF_DROPIN="/etc/fail2ban/jail.d/99-altrix-sshd-hardening.local"

cat << 'EOF' > "$CONF_DROPIN"
# ==============================================================================
# AltRix Production Fail2Ban SSH Hardening - Phase 19B
# Drop-in: /etc/fail2ban/jail.d/99-altrix-sshd-hardening.local
# ==============================================================================

[DEFAULT]
# Persistent ban database with bounded retention
dbfile = /var/lib/fail2ban/fail2ban.sqlite3
dbpurgeage = 1d

# Progressive ban escalation for repeat offenders
bantime.increment = true
bantime.rndtime = 10m
bantime.factor = 2
bantime.maxtime = 7d

[sshd]
enabled = true
port = 22
backend = systemd
findtime = 10m
maxretry = 5
bantime = 1h

# Progressive ban escalation for SSH
bantime.increment = true
bantime.rndtime = 10m
bantime.factor = 2
bantime.maxtime = 7d
EOF

chmod 644 "$CONF_DROPIN"
chown root:root "$CONF_DROPIN"
echo "    Created $CONF_DROPIN"

echo ""
echo "[+] 3. Validating Fail2Ban Configuration (fail2ban-client -t)..."
if fail2ban-client -t; then
  echo "    Fail2Ban configuration test: SUCCESS"
  echo "    Reloading Fail2Ban service..."
  systemctl restart fail2ban
  sleep 2
else
  echo "[-] Fail2Ban configuration test FAILED! Restoring backup..."
  rm -f "$CONF_DROPIN"
  cp -r "$BACKUP_DIR/fail2ban/"* /etc/fail2ban/
  systemctl restart fail2ban
  exit 1
fi

echo ""
echo "[+] 4. Verifying Fail2Ban & SSH Jail Status..."
echo -n "    Fail2Ban service status: "
systemctl is-active fail2ban

echo "--- Fail2Ban Jail Overview ---"
fail2ban-client status

echo ""
echo "--- Fail2Ban SSHD Jail Detailed Status ---"
fail2ban-client status sshd

echo ""
echo "[+] 5. Production Health & Regression Verification..."
echo -n "    SSH daemon: "
systemctl is-active ssh

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
echo "  PHASE 19B COMPLETE: FAIL2BAN SSH HARDENING APPLIED             "
echo "================================================================="
