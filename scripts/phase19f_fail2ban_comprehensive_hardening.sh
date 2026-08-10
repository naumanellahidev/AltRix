#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19F: Fail2Ban Comprehensive Security Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19F: Fail2Ban Comprehensive Security Hardening           "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/fail2ban_phase19f_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Fail2Ban Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/fail2ban "$BACKUP_DIR/"
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Deploying Comprehensive Fail2Ban Jails (SSHD & Recidive)..."
CONF_DROPIN="/etc/fail2ban/jail.d/99-altrix-comprehensive.local"

cat << 'EOF' > "$CONF_DROPIN"
# ==============================================================================
# AltRix Production Fail2Ban Comprehensive Hardening - Phase 19F
# Drop-in: /etc/fail2ban/jail.d/99-altrix-comprehensive.local
# ==============================================================================

[DEFAULT]
# Whitelist local loopback
ignoreip = 127.0.0.1/8 ::1

# Persistent SQLite ban state
dbfile = /var/lib/fail2ban/fail2ban.sqlite3
dbpurgeage = 1d

# Progressive ban escalation
bantime.increment = true
bantime.rndtime = 10m
bantime.factor = 2
bantime.maxtime = 7d

# ------------------------------------------------------------------------------
# 1. SSH Administrative Jail (Systemd Journal Backend)
# ------------------------------------------------------------------------------
[sshd]
enabled = true
port = 22
backend = systemd
findtime = 10m
maxretry = 5
bantime = 1h
bantime.increment = true
bantime.rndtime = 10m
bantime.factor = 2
bantime.maxtime = 7d

# ------------------------------------------------------------------------------
# 2. Recidive Jail (Repeat Offender Multi-Day Protection)
# Monitors /var/log/fail2ban.log and blocks repeat offenders across all ports
# ------------------------------------------------------------------------------
[recidive]
enabled = true
logpath = /var/log/fail2ban.log
banaction = %(banaction_allports)s
findtime = 1d
maxretry = 3
bantime = 7d
bantime.increment = true
bantime.factor = 2
bantime.maxtime = 30d
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
echo "[+] 4. Verifying Active Fail2Ban Jails..."
echo "--- Fail2Ban Master Status ---"
fail2ban-client status

echo ""
echo "--- SSHD Jail Status ---"
fail2ban-client status sshd

echo ""
echo "--- Recidive Jail Status ---"
fail2ban-client status recidive

echo ""
echo "[+] 5. Production Health & Regression Verification..."
echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo -n "    SSH daemon: "
systemctl is-active ssh

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
echo "  PHASE 19F COMPLETE: COMPREHENSIVE FAIL2BAN HARDENING APPLIED   "
echo "================================================================="
