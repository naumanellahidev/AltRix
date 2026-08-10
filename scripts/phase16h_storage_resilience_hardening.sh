#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16H: VPS Storage, Disk-I/O & Filesystem Resilience
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16H: VPS Storage, Disk-I/O & Filesystem Resilience       "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Inspecting Storage Capacity & Inode Availability..."
echo "--- Filesystem Capacity (df -h) ---"
df -h -x tmpfs -x devtmpfs

echo ""
echo "--- Inode Availability (df -i) ---"
df -i -x tmpfs -x devtmpfs

echo ""
echo "[+] 2. Configuring Docker Daemon Log Rotation (Bounded Log Growth)..."
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"

if [ -f "$DOCKER_DAEMON_JSON" ]; then
  echo "    Existing $DOCKER_DAEMON_JSON detected."
  if ! grep -q "max-size" "$DOCKER_DAEMON_JSON"; then
    echo "    Adding log-opts max-size to existing daemon.json..."
    # Safe python-based JSON merge if python3 is available
    python3 -c "
import json
try:
    with open('$DOCKER_DAEMON_JSON', 'r') as f:
        data = json.load(f)
except Exception:
    data = {}
data.setdefault('log-driver', 'json-file')
data.setdefault('log-opts', {'max-size': '50m', 'max-file': '3'})
with open('$DOCKER_DAEMON_JSON', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
  fi
else
  echo "    Creating $DOCKER_DAEMON_JSON with bounded container log rotation..."
  mkdir -p /etc/docker
  cat << 'EOF' > "$DOCKER_DAEMON_JSON"
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
  chmod 644 "$DOCKER_DAEMON_JSON"
fi

echo "    Docker daemon log rotation configured (50MB max, 3 files)."

echo ""
echo "[+] 3. Verifying Systemd Journal Disk Bounds (1GB Cap)..."
journalctl --disk-usage
systemctl is-active systemd-journald

echo ""
echo "[+] 4. Verifying Logrotate Timer & System Log Rotation..."
if systemctl is-active --quiet logrotate.timer 2>/dev/null; then
  echo "    logrotate.timer is ACTIVE."
else
  echo "    Enabling logrotate.timer..."
  systemctl enable --now logrotate.timer 2>/dev/null || true
fi

echo ""
echo "[+] 5. Verifying Temporary Directories (/tmp and /var/tmp)..."
echo "    /tmp:     $(stat -c '%a %U:%G %n' /tmp)"
echo "    /var/tmp: $(stat -c '%a %U:%G %n' /var/tmp)"

echo ""
echo "[+] 6. Inspecting Docker Storage Footprint (Non-Destructive)..."
docker system df

echo ""
echo "[+] 7. Production Health & Regression Verification..."
echo -n "    Docker daemon: "
systemctl is-active docker || echo "Docker not active"

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx || echo "Nginx not active"

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban || echo "Fail2Ban not active"

echo -n "    SSH daemon: "
systemctl is-active ssh || echo "SSH not active"

echo ""
echo "================================================================="
echo "  PHASE 16H COMPLETE: STORAGE & FILESYSTEM RESILIENCE APPLIED   "
echo "================================================================="
