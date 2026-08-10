#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16A: Ubuntu OS Baseline & Service Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16A: Ubuntu OS Baseline & Unnecessary Service Hardening  "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Verifying Operating System..."
cat /etc/os-release | grep -E "^(NAME|VERSION)="

echo ""
echo "[+] 2. Configuring /tmp & /var/tmp Security Baseline (Mode 1777)..."
chmod 1777 /tmp
chmod 1777 /var/tmp
echo "    /tmp:     $(stat -c '%a %U:%G %n' /tmp)"
echo "    /var/tmp: $(stat -c '%a %U:%G %n' /var/tmp)"

echo ""
echo "[+] 3. Enforcing Critical OS File Permission Hygiene..."
chmod 644 /etc/passwd && chown root:root /etc/passwd
chmod 640 /etc/shadow && chown root:shadow /etc/shadow || chmod 600 /etc/shadow
chmod 644 /etc/group && chown root:root /etc/group
chmod 640 /etc/gshadow && chown root:shadow /etc/gshadow || chmod 600 /etc/gshadow
chmod 440 /etc/sudoers && chown root:root /etc/sudoers
chmod 750 /etc/sudoers.d && chown root:root /etc/sudoers.d

echo "    /etc/passwd:  $(stat -c '%a %U:%G %n' /etc/passwd)"
echo "    /etc/shadow:  $(stat -c '%a %U:%G %n' /etc/shadow)"
echo "    /etc/group:   $(stat -c '%a %U:%G %n' /etc/group)"
echo "    /etc/gshadow: $(stat -c '%a %U:%G %n' /etc/gshadow)"
echo "    /etc/sudoers: $(stat -c '%a %U:%G %n' /etc/sudoers)"

echo ""
echo "[+] 4. Verifying & Enabling Time Synchronization (NTP)..."
timedatectl set-ntp on || true
timedatectl status | grep -E "(Local time|Time zone|NTP service|synchronized)"

echo ""
echo "[+] 5. Verifying AppArmor Baseline..."
if systemctl is-active --quiet apparmor; then
  echo "    AppArmor service: ACTIVE"
else
  echo "    Enabling and starting AppArmor..."
  systemctl enable --now apparmor || true
fi

echo ""
echo "[+] 6. Inspecting & Disabling Clearly Unnecessary Services..."
# List of known safe-to-disable desktop/telemetry/legacy daemons on a headless server
UNNECESSARY_SERVICES=(
  "cups"
  "cups-browsed"
  "avahi-daemon"
  "bluetooth"
  "whoopsie"
  "ModemManager"
  "pppd-dns"
)

for svc in "${UNNECESSARY_SERVICES[@]}"; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "    Stopping and masking unnecessary service: $svc"
    systemctl stop "$svc" 2>/dev/null || true
    systemctl mask "$svc" 2>/dev/null || true
  elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    echo "    Masking inactive service: $svc"
    systemctl mask "$svc" 2>/dev/null || true
  fi
done

echo ""
echo "[+] 7. Ensuring Local IDE Admin SSH Key is Authorized (Lockout Safe)..."
ADMIN_HOME="/home/altrixadmin"
if [ -d "$ADMIN_HOME" ]; then
  mkdir -p "$ADMIN_HOME/.ssh"
  chmod 700 "$ADMIN_HOME/.ssh"
  KEY_LINE="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKVdjoh5NqLN6BamQ80Hi+uR7VNNAfxdO0025mkWp3eN microsoft@JeckieChen"
  if ! grep -q "microsoft@JeckieChen" "$ADMIN_HOME/.ssh/authorized_keys" 2>/dev/null; then
    echo "$KEY_LINE" >> "$ADMIN_HOME/.ssh/authorized_keys"
    echo "    Added local admin key to $ADMIN_HOME/.ssh/authorized_keys"
  else
    echo "    Local admin key already present in $ADMIN_HOME/.ssh/authorized_keys"
  fi
  chmod 600 "$ADMIN_HOME/.ssh/authorized_keys"
  chown -R altrixadmin:altrixadmin "$ADMIN_HOME/.ssh"
fi

echo ""
echo "[+] 8. Targeted Production Health Verification..."
echo -n "    Nginx status: "
systemctl is-active nginx || echo "Nginx not active"

echo -n "    Docker status: "
systemctl is-active docker || echo "Docker not active"

echo -n "    Fail2Ban status: "
systemctl is-active fail2ban || echo "Fail2Ban not active"

echo ""
echo "================================================================="
echo "  PHASE 16A COMPLETE: OS BASELINE & SERVICE HARDENING APPLIED   "
echo "================================================================="
