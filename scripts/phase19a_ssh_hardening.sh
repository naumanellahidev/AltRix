#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19A: SSH Administrative Access Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19A: SSH Administrative Access Hardening                 "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/etc/ssh/backup_phase19a_$TIMESTAMP"

echo "[+] 1. Creating Timestamped SSH Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/ssh/sshd_config "$BACKUP_DIR/"
if [ -d /etc/ssh/sshd_config.d ]; then
  cp -r /etc/ssh/sshd_config.d "$BACKUP_DIR/"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Enforcing Secure SSH Key & Directory Permissions..."
mkdir -p /home/altrixadmin/.ssh
chmod 700 /home/altrixadmin/.ssh
chown -R altrixadmin:altrixadmin /home/altrixadmin/.ssh
if [ -f /home/altrixadmin/.ssh/authorized_keys ]; then
  chmod 600 /home/altrixadmin/.ssh/authorized_keys
fi
echo "    Permissions set: /home/altrixadmin/.ssh (700), authorized_keys (600)"

echo ""
echo "[+] 3. Deploying Dedicated SSH Hardening Drop-in..."
CONF_DROPIN="/etc/ssh/sshd_config.d/00-altrix-ssh-hardening.conf"

cat << 'EOF' > "$CONF_DROPIN"
# ==============================================================================
# AltRix Production SSH Administrative Hardening Policy - Phase 19A
# Drop-in: /etc/ssh/sshd_config.d/00-altrix-ssh-hardening.conf
# ==============================================================================

# Authentication lockdown
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
PubkeyAuthentication yes
AuthenticationMethods publickey

# Access control restriction
AllowUsers altrixadmin

# Brute-force & session bounds
MaxAuthTries 5
MaxSessions 20
LoginGraceTime 30

# Keepalive & idle disconnects (5 minutes idle timeout)
ClientAliveInterval 300
ClientAliveCountMax 2
TCPKeepAlive yes

# Attack surface & forwarding reduction
X11Forwarding no
AllowAgentForwarding no
PermitTunnel no
AllowTcpForwarding no
EOF

chmod 644 "$CONF_DROPIN"
chown root:root "$CONF_DROPIN"
echo "    Created $CONF_DROPIN"

echo ""
echo "[+] 4. Validating SSH Configuration Syntax (sshd -t)..."
if sshd -t; then
  echo "    sshd configuration test: SUCCESS"
  echo "    Reloading SSH daemon gracefully..."
  systemctl reload ssh || systemctl reload sshd
else
  echo "[-] sshd configuration test FAILED! Restoring backup..."
  rm -f "$CONF_DROPIN"
  cp -r "$BACKUP_DIR/sshd_config.d/"* /etc/ssh/sshd_config.d/
  systemctl reload ssh || systemctl reload sshd
  exit 1
fi

echo ""
echo "[+] 5. Verifying Effective SSH Configuration (sshd -T)..."
sshd -T | grep -E "(passwordauthentication|permitrootlogin|pubkeyauthentication|kbdinteractiveauthentication|allowusers|maxauthtries|maxsessions|logingracetime|clientalive|allowtcpforwarding|x11forwarding)" || true

echo ""
echo "[+] 6. Production Health & Regression Verification..."
echo -n "    SSH daemon: "
systemctl is-active ssh

echo -n "    Docker daemon: "
systemctl is-active docker

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo ""
echo "================================================================="
echo "  PHASE 19A COMPLETE: SSH ADMINISTRATIVE HARDENING APPLIED       "
echo "================================================================="
