#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 16B: Kernel, Sysctl & Process Security
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 16B: Kernel, Sysctl & Process Security Hardening         "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Inspecting Existing Kernel & Docker Forwarding State..."
uname -r
DOCKER_FORWARD=$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo "1")
echo "    Current net.ipv4.ip_forward: $DOCKER_FORWARD"

SYSCTL_CONF="/etc/sysctl.d/99-altrix-kernel-hardening.conf"

echo ""
echo "[+] 2. Deploying Dedicated Sysctl Hardening Drop-in: $SYSCTL_CONF..."

cat << 'EOF' > "$SYSCTL_CONF"
# ==============================================================================
# AltRix Production Sysctl Hardening (Ubuntu 24.04 LTS)
# Drop-in: /etc/sysctl.d/99-altrix-kernel-hardening.conf
# ==============================================================================

# --- Network: Source Route, Redirects & ICMP ---
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1

# --- Network: Anti-Spoofing & SYN Flood Protection ---
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.tcp_syncookies = 1

# --- Network: Docker Compatibility (Preserve Container Forwarding) ---
net.ipv4.ip_forward = 1

# --- Kernel: Information Disclosure & ASLR ---
kernel.randomize_va_space = 2
kernel.kptr_restrict = 1
kernel.dmesg_restrict = 1
kernel.yama.ptrace_scope = 1

# --- Filesystem: Link Protection & Core Dumps ---
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.protected_fifos = 2
fs.protected_regular = 2
fs.suid_dumpable = 0
EOF

chmod 644 "$SYSCTL_CONF"
echo "    Created and secured $SYSCTL_CONF"

echo ""
echo "[+] 3. Applying Sysctl Parameters Safely..."
sysctl --system

echo ""
echo "[+] 4. Verifying Live Hardened Sysctl Values..."
echo "    net.ipv4.conf.all.accept_source_route:   $(sysctl -n net.ipv4.conf.all.accept_source_route)"
echo "    net.ipv4.conf.all.accept_redirects:      $(sysctl -n net.ipv4.conf.all.accept_redirects)"
echo "    net.ipv4.conf.all.send_redirects:        $(sysctl -n net.ipv4.conf.all.send_redirects)"
echo "    net.ipv4.icmp_echo_ignore_broadcasts:    $(sysctl -n net.ipv4.icmp_echo_ignore_broadcasts)"
echo "    net.ipv4.conf.all.rp_filter:             $(sysctl -n net.ipv4.conf.all.rp_filter)"
echo "    net.ipv4.tcp_syncookies:                 $(sysctl -n net.ipv4.tcp_syncookies)"
echo "    net.ipv4.ip_forward (Docker preserved):  $(sysctl -n net.ipv4.ip_forward)"
echo "    kernel.randomize_va_space:               $(sysctl -n kernel.randomize_va_space)"
echo "    kernel.kptr_restrict:                    $(sysctl -n kernel.kptr_restrict)"
echo "    kernel.dmesg_restrict:                   $(sysctl -n kernel.dmesg_restrict)"
echo "    kernel.yama.ptrace_scope:                $(sysctl -n kernel.yama.ptrace_scope)"
echo "    fs.protected_hardlinks:                  $(sysctl -n fs.protected_hardlinks)"
echo "    fs.protected_symlinks:                   $(sysctl -n fs.protected_symlinks)"
echo "    fs.suid_dumpable:                        $(sysctl -n fs.suid_dumpable)"

echo ""
echo "[+] 5. Targeted Production Regression Verification..."
echo -n "    Docker daemon: "
systemctl is-active docker || echo "Docker not active"

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx || echo "Nginx not active"

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban || echo "Fail2Ban not active"

echo ""
echo "================================================================="
echo "  PHASE 16B COMPLETE: KERNEL & SYSCTL HARDENING APPLIED         "
echo "================================================================="
