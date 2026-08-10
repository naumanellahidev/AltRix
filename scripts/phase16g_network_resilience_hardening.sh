#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16G: Network & Connection Resilience Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16G: Network & Connection Resilience Hardening           "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Inspecting Current Kernel Network Parameters..."
echo "    Current net.core.somaxconn:           $(sysctl -n net.core.somaxconn)"
echo "    Current net.ipv4.tcp_max_syn_backlog: $(sysctl -n net.ipv4.tcp_max_syn_backlog)"
echo "    Current net.ipv4.tcp_syncookies:      $(sysctl -n net.ipv4.tcp_syncookies)"
echo "    Current net.ipv4.tcp_keepalive_time:  $(sysctl -n net.ipv4.tcp_keepalive_time)"

SYSCTL_RESILIENCE="/etc/sysctl.d/99-altrix-network-resilience.conf"

echo ""
echo "[+] 2. Deploying Dedicated Network Resilience Drop-in: $SYSCTL_RESILIENCE..."

cat << 'EOF' > "$SYSCTL_RESILIENCE"
# ==============================================================================
# AltRix Production Network & Connection Resilience (Ubuntu 24.04 LTS)
# Drop-in: /etc/sysctl.d/99-altrix-network-resilience.conf
# ==============================================================================

# --- Connection Queue & SYN Backlog Resilience ---
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_syncookies = 1

# --- Connection Lifecycle & Stale Connection Teardown ---
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5

# --- Ephemeral Ports & TIME_WAIT Protection ---
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_max_tw_buckets = 1440000

# --- High-Concurrency Socket Memory Buffers (16MB Max) ---
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
EOF

chmod 644 "$SYSCTL_RESILIENCE"
echo "    Created $SYSCTL_RESILIENCE"

echo ""
echo "[+] 3. Applying Sysctl Parameters Safely..."
sysctl --system

echo ""
echo "[+] 4. Verifying Effective Runtime Values..."
echo "    net.core.somaxconn:              $(sysctl -n net.core.somaxconn)"
echo "    net.ipv4.tcp_max_syn_backlog:    $(sysctl -n net.ipv4.tcp_max_syn_backlog)"
echo "    net.ipv4.tcp_syncookies:         $(sysctl -n net.ipv4.tcp_syncookies)"
echo "    net.ipv4.tcp_fin_timeout:        $(sysctl -n net.ipv4.tcp_fin_timeout)"
echo "    net.ipv4.tcp_keepalive_time:     $(sysctl -n net.ipv4.tcp_keepalive_time)"
echo "    net.ipv4.tcp_keepalive_intvl:    $(sysctl -n net.ipv4.tcp_keepalive_intvl)"
echo "    net.ipv4.tcp_keepalive_probes:   $(sysctl -n net.ipv4.tcp_keepalive_probes)"
echo "    net.ipv4.ip_local_port_range:    $(sysctl -n net.ipv4.ip_local_port_range)"
echo "    net.ipv4.tcp_max_tw_buckets:     $(sysctl -n net.ipv4.tcp_max_tw_buckets)"

echo ""
echo "[+] 5. Inspecting Socket Statistics..."
ss -s
cat /proc/net/sockstat

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
echo "  PHASE 16G COMPLETE: NETWORK RESILIENCE HARDENING APPLIED       "
echo "================================================================="
