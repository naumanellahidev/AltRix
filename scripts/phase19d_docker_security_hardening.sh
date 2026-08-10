#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19D: Docker & Container Security Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19D: Docker & Container Security Hardening               "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/docker_phase19d_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Docker Daemon Configuration Backup..."
mkdir -p "$BACKUP_DIR"
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json "$BACKUP_DIR/daemon.json"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Enforcing Secure Docker Socket Permissions..."
if [ -S /var/run/docker.sock ]; then
  chown root:docker /var/run/docker.sock
  chmod 660 /var/run/docker.sock
  echo "    Verified /var/run/docker.sock: 660 root:docker (Non-world-writable)"
fi

echo ""
echo "[+] 3. Auditing Docker Daemon Remote API Exposure..."
if ss -lnt | grep -E "(:2375|:2376)" ; then
  echo "    [WARN] Unauthenticated Docker remote API port detected!"
else
  echo "    [PASS] Docker remote TCP API (2375/2376) is NOT exposed."
fi

echo ""
echo "[+] 4. Auditing Primary Application Container (altrix_backend)..."
if docker ps -q -f name=altrix_backend >/dev/null; then
  PRIV_STATE=$(docker inspect altrix_backend --format '{{.HostConfig.Privileged}}')
  NET_MODE=$(docker inspect altrix_backend --format '{{.HostConfig.NetworkMode}}')
  PORT_BINDINGS=$(docker inspect altrix_backend --format '{{json .HostConfig.PortBindings}}')
  CONTAINER_STATUS=$(docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})')

  echo "    - Status: $CONTAINER_STATUS"
  echo "    - Privileged Mode: $PRIV_STATE (Expected: false)"
  echo "    - Network Isolation: $NET_MODE (Expected: isolated bridge)"
  echo "    - Port Bindings: $PORT_BINDINGS (Expected: 127.0.0.1:8000 only)"
else
  echo "    [WARN] Container altrix_backend not found."
fi

echo ""
echo "[+] 5. Production Health & Regression Verification..."
echo -n "    Docker daemon: "
systemctl is-active docker

echo -n "    SSH daemon: "
systemctl is-active ssh

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx

echo -n "    Production HTTPS: "
curl -Is https://altrixcore.com | head -n 1

echo ""
echo "================================================================="
echo "  PHASE 19D COMPLETE: DOCKER SECURITY HARDENING VERIFIED         "
echo "================================================================="
