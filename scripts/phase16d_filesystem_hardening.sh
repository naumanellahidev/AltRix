#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16D: Filesystem, Permissions & Priv-Esc Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16D: Filesystem, Permissions & Priv-Esc Hardening        "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Auditing & Enforcing Critical Sensitive OS File Permissions..."

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
echo "[+] 2. Enforcing Sticky Bit on /tmp and /var/tmp..."
chmod 1777 /tmp
chmod 1777 /var/tmp
echo "    /tmp:     $(stat -c '%a %U:%G %n' /tmp)"
echo "    /var/tmp: $(stat -c '%a %U:%G %n' /var/tmp)"

echo ""
echo "[+] 3. Auditing & Securing Cron Directories..."
CRON_DIRS=(
  "/etc/cron.d"
  "/etc/cron.daily"
  "/etc/cron.hourly"
  "/etc/cron.weekly"
  "/etc/cron.monthly"
)

for cdir in "${CRON_DIRS[@]}"; do
  if [ -d "$cdir" ]; then
    chmod 750 "$cdir"
    chown root:root "$cdir"
    echo "    $cdir: $(stat -c '%a %U:%G %n' "$cdir")"
  fi
done

echo ""
echo "[+] 4. Verifying altrixadmin Home & SSH Directory Hygiene..."
ADMIN_HOME="/home/altrixadmin"
if [ -d "$ADMIN_HOME" ]; then
  chmod 750 "$ADMIN_HOME"
  if [ -d "$ADMIN_HOME/.ssh" ]; then
    chmod 700 "$ADMIN_HOME/.ssh"
    chown altrixadmin:altrixadmin "$ADMIN_HOME/.ssh"
    if [ -f "$ADMIN_HOME/.ssh/authorized_keys" ]; then
      chmod 600 "$ADMIN_HOME/.ssh/authorized_keys"
      chown altrixadmin:altrixadmin "$ADMIN_HOME/.ssh/authorized_keys"
      echo "    $ADMIN_HOME/.ssh/authorized_keys: $(stat -c '%a %U:%G %n' "$ADMIN_HOME/.ssh/authorized_keys")"
    fi
  fi
fi

echo ""
echo "[+] 5. Auditing SUID/SGID Binaries & Mitigating Unnecessary Risks..."
# Check and remove SUID bit from known legacy/unnecessary binaries if present
LEGACY_SUID=(
  "/usr/bin/rcp"
  "/usr/bin/rlogin"
  "/usr/bin/rsh"
  "/usr/bin/traceroute6.iputils"
)

for bin in "${LEGACY_SUID[@]}"; do
  if [ -f "$bin" ] && [ -u "$bin" ]; then
    echo "    Removing SUID bit from legacy binary: $bin"
    chmod u-s "$bin"
  fi
done

echo "    Essential SUID binaries preserved (sudo, su, mount, umount, passwd, ping)."

echo ""
echo "[+] 6. Scanning for Unexpected World-Writable Files in /etc and /usr/local..."
WW_FILES=$(find /etc /usr/local -xdev -type f -perm -0002 2>/dev/null || true)
if [ -n "$WW_FILES" ]; then
  echo "    Warning: Found world-writable files (remediating permissions):"
  echo "$WW_FILES"
  find /etc /usr/local -xdev -type f -perm -0002 -exec chmod o-w {} + 2>/dev/null || true
else
  echo "    Clean: No world-writable files found in /etc or /usr/local."
fi

echo ""
echo "[+] 7. Targeted Verification..."
echo -n "    visudo syntax check: "
visudo -c

echo -n "    Docker status: "
systemctl is-active docker || echo "Docker not active"

echo -n "    Nginx status: "
systemctl is-active nginx || echo "Nginx not active"

echo -n "    SSH status: "
systemctl is-active ssh || echo "SSH not active"

echo -n "    Fail2Ban status: "
systemctl is-active fail2ban || echo "Fail2Ban not active"

echo ""
echo "================================================================="
echo "  PHASE 16D COMPLETE: FILESYSTEM & PRIV-ESC HARDENING APPLIED   "
echo "================================================================="
