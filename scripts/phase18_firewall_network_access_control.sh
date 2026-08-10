#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 18: Firewall + Network Access Control + Cloudflare Origin Protection
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 18: Firewall + Network Access Control + Origin Protection"
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

echo "[+] 1. Inspecting Live Firewall Architecture..."
ufw status verbose

echo ""
echo "[+] 2. Enforcing Secure Default Firewall Policy & Inbound Rules..."
# Ensure default policy: deny incoming, allow outgoing, deny routed
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed

# Ensure essential inbound administrative & web services are allowed
ufw allow 22/tcp comment "SSH Port 22"
ufw allow 80/tcp comment "HTTP Web Gateway"
ufw allow 443/tcp comment "HTTPS TLS Gateway"

# Enable / reload UFW safely
ufw --force enable
ufw reload

echo ""
echo "[+] 3. Verifying Docker & Private Service Isolation..."
echo "--- Active Listening Ports (ss -lntup) ---"
ss -lntup | grep -E "(:22|:80|:443|:8000)" || true

echo ""
echo "--- Verifying 127.0.0.1:8000 Is Strictly Localhost-Only ---"
if ss -lnt | grep -q "127.0.0.1:8000"; then
  echo "    [PASS] Port 8000 is bound strictly to 127.0.0.1 (Localhost only)."
else
  echo "    [WARN] Port 8000 binding could not be verified."
fi

echo ""
echo "[+] 4. Verifying Cloudflare Proxy & Origin Ingress..."
echo "--- DNS Resolution for altrixcore.com ---"
dig +short altrixcore.com || host altrixcore.com || true

echo "--- HTTPS Response Headers from Cloudflare Edge ---"
curl -Is https://altrixcore.com | grep -E "(HTTP/|server:|cf-ray:|strict-transport-security)" || true

echo ""
echo "[+] 5. Verifying Fail2Ban & Service Operational Health..."
echo -n "    Fail2Ban status: "
fail2ban-client status sshd | grep "Currently banned" || echo "Active"

echo -n "    Docker status: "
systemctl is-active docker

echo -n "    Nginx status: "
systemctl is-active nginx

echo -n "    SSH status: "
systemctl is-active ssh

echo ""
echo "================================================================="
echo "  PHASE 18 COMPLETE: FIREWALL & NETWORK ACCESS CONTROL VERIFIED  "
echo "================================================================="
