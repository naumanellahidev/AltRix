#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16C: Systemd Service & Daemon Security
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16C: Systemd Service & Daemon Security Hardening         "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Inspecting & Disabling Unnecessary / Legacy Daemons..."

CANDIDATE_UNNECESSARY_SERVICES=(
  "rpcbind"
  "rpcbind.socket"
  "xinetd"
  "telnet"
  "rsh"
  "rlogin"
  "tftp"
  "avahi-daemon"
  "avahi-daemon.socket"
  "cups"
  "cups.socket"
  "cups-browsed"
  "bluetooth"
  "ModemManager"
  "whoopsie"
  "apport"
)

DISABLED_COUNT=0
for svc in "${CANDIDATE_UNNECESSARY_SERVICES[@]}"; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "    Stopping and disabling unnecessary service: $svc"
    systemctl disable --now "$svc" 2>/dev/null || true
    systemctl mask "$svc" 2>/dev/null || true
    DISABLED_COUNT=$((DISABLED_COUNT + 1))
  elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    echo "    Masking enabled but inactive service: $svc"
    systemctl disable "$svc" 2>/dev/null || true
    systemctl mask "$svc" 2>/dev/null || true
    DISABLED_COUNT=$((DISABLED_COUNT + 1))
  fi
done

if [ "$DISABLED_COUNT" -eq 0 ]; then
  echo "    No unnecessary legacy daemons found active/enabled (clean baseline)."
fi

echo ""
echo "[+] 2. Configuring Systemd Journal Retention & Size Limits..."
JOURNAL_CONF_DIR="/etc/systemd/journald.conf.d"
JOURNAL_CONF="$JOURNAL_CONF_DIR/99-altrix-retention.conf"

mkdir -p "$JOURNAL_CONF_DIR"
cat << 'EOF' > "$JOURNAL_CONF"
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=1G
SystemKeepFree=2G
SystemMaxFileSize=128M
MaxRetentionSec=1month
ForwardToSyslog=no
EOF

chmod 644 "$JOURNAL_CONF"
echo "    Created and secured $JOURNAL_CONF"
systemctl restart systemd-journald
echo "    systemd-journald restarted with 1GB persistent retention limit."

echo ""
echo "[+] 3. Preserving & Verifying Core Production Services..."
CORE_SERVICES=(
  "docker"
  "containerd"
  "nginx"
  "ssh"
  "fail2ban"
  "systemd-journald"
  "systemd-logind"
  "systemd-resolved"
  "cron"
)

for cs in "${CORE_SERVICES[@]}"; do
  if systemctl is-active --quiet "$cs" 2>/dev/null; then
    echo "    [ACTIVE] $cs"
  else
    echo "    [WARNING/INACTIVE] $cs"
  fi
done

echo ""
echo "[+] 4. Verifying AltRix Specific Automation Services & Timers..."
ALTRIX_SERVICES=(
  "altrix-monitor"
  "altrix-backup"
  "altrix-security-check"
)

for asvc in "${ALTRIX_SERVICES[@]}"; do
  if systemctl list-unit-files "$asvc*" --no-pager 2>/dev/null | grep -q "$asvc"; then
    echo "    $asvc status: $(systemctl is-active "$asvc" 2>/dev/null || echo 'inactive')"
  fi
done

echo ""
echo "[+] 5. Checking for Failed Systemd Units..."
FAILED_UNITS=$(systemctl --failed --no-pager 2>/dev/null || true)
echo "$FAILED_UNITS"

echo ""
echo "[+] 6. Inspecting Active Listening Ports..."
ss -lntup | grep -E "(LISTEN|UNCONN)" | awk '{print $1, $5, $7}' | column -t

echo ""
echo "================================================================="
echo "  PHASE 16C COMPLETE: SYSTEMD & DAEMON HARDENING APPLIED         "
echo "================================================================="
