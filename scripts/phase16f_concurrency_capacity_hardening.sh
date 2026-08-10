#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16F: High-Concurrency, Resource Limits & Capacity
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16F: VPS High-Concurrency, Resource Limits & Capacity   "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Configuring Kernel Concurrency, Socket Backlog & Buffer Limits..."
SYSCTL_CAPACITY="/etc/sysctl.d/99-altrix-capacity.conf"

cat << 'EOF' > "$SYSCTL_CAPACITY"
# ==============================================================================
# AltRix Production High-Concurrency Capacity Tuning (Ubuntu 24.04 LTS)
# Drop-in: /etc/sysctl.d/99-altrix-capacity.conf
# Target: Production web traffic, Docker & high concurrent user connections
# ==============================================================================

# --- System-Wide File Descriptors & PIDs ---
fs.file-max = 2097152
fs.nr_open = 2097152
kernel.pid_max = 4194304

# --- TCP Connection Backlog & Ephemeral Ports ---
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_max_tw_buckets = 1440000

# --- TCP Buffer Memory (High-Bandwidth Socket Scaling) ---
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# --- Memory & Swap Balance (Prevent Aggressive Swapping under Load) ---
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF

chmod 644 "$SYSCTL_CAPACITY"
echo "    Created $SYSCTL_CAPACITY"

echo ""
echo "[+] 2. Applying Sysctl Parameters Safely..."
sysctl --system

echo ""
echo "[+] 3. Configuring User & Process File Descriptor Limits (/etc/security/limits.d/)..."
LIMITS_CONF="/etc/security/limits.d/99-altrix-limits.conf"

cat << 'EOF' > "$LIMITS_CONF"
# ==============================================================================
# AltRix Production Process & File Descriptor Limits
# Drop-in: /etc/security/limits.d/99-altrix-limits.conf
# ==============================================================================
*          soft    nofile    1048576
*          hard    nofile    1048576
*          soft    nproc     512000
*          hard    nproc     512000
root       soft    nofile    1048576
root       hard    nofile    1048576
root       soft    nproc     512000
root       hard    nproc     512000
altrixadmin soft   nofile    1048576
altrixadmin hard   nofile    1048576
altrixadmin soft   nproc     512000
altrixadmin hard   nproc     512000
EOF

chmod 644 "$LIMITS_CONF"
echo "    Created $LIMITS_CONF"

echo ""
echo "[+] 4. Configuring Systemd Manager Default Resource Limits..."
SYSTEMD_CONF_DIR="/etc/systemd/system.conf.d"
SYSTEMD_CAPACITY="$SYSTEMD_CONF_DIR/99-altrix-capacity.conf"

mkdir -p "$SYSTEMD_CONF_DIR"
cat << 'EOF' > "$SYSTEMD_CAPACITY"
# ==============================================================================
# AltRix Production Systemd Manager Resource Limits
# Drop-in: /etc/systemd/system.conf.d/99-altrix-capacity.conf
# ==============================================================================
[Manager]
DefaultLimitNOFILE=1048576:1048576
DefaultLimitNPROC=512000:512000
DefaultTasksMax=512000
EOF

chmod 644 "$SYSTEMD_CAPACITY"
echo "    Created $SYSTEMD_CAPACITY"

echo "    Re-executing systemd manager to load capacity limits..."
systemctl daemon-reexec

echo ""
echo "[+] 5. Targeted Verification of Runtime Concurrency Limits..."
echo "    net.core.somaxconn:              $(sysctl -n net.core.somaxconn)"
echo "    net.ipv4.tcp_max_syn_backlog:    $(sysctl -n net.ipv4.tcp_max_syn_backlog)"
echo "    net.ipv4.ip_local_port_range:    $(sysctl -n net.ipv4.ip_local_port_range)"
echo "    fs.file-max:                     $(sysctl -n fs.file-max)"
echo "    fs.nr_open:                      $(sysctl -n fs.nr_open)"
echo "    vm.swappiness:                   $(sysctl -n vm.swappiness)"
echo "    Systemd DefaultLimitNOFILE:      $(systemctl show --property=DefaultLimitNOFILE --value)"
echo "    Systemd DefaultLimitNPROC:       $(systemctl show --property=DefaultLimitNPROC --value)"
echo "    Systemd DefaultTasksMax:         $(systemctl show --property=DefaultTasksMax --value)"

echo ""
echo "[+] 6. Production Health & Regression Verification..."
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
echo "  PHASE 16F COMPLETE: VPS CAPACITY READINESS APPLIED             "
echo "================================================================="
