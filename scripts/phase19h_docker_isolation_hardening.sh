#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19H: Docker Daemon & Container Isolation Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19H: Docker Daemon & Container Isolation Hardening       "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/docker_phase19h_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Docker Configuration Backup..."
mkdir -p "$BACKUP_DIR"
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json "$BACKUP_DIR/daemon.json"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Applying Hardened Docker Daemon Configuration..."
cat << 'EOF' > /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5",
    "compress": "true"
  },
  "storage-driver": "overlayfs",
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
chmod 644 /etc/docker/daemon.json

echo "    Validating Docker daemon reload..."
systemctl reload docker || systemctl restart docker
sleep 2

echo ""
echo "[+] 3. Auditing Docker Daemon Remote API & Socket Security..."
if ss -lnt | grep -E "(:2375|:2376)"; then
  echo "    [WARN] Unauthenticated Docker remote TCP API detected!"
else
  echo "    [PASS] Docker remote TCP API (2375/2376) is NOT exposed."
fi

chmod 660 /var/run/docker.sock
chown root:docker /var/run/docker.sock
echo "    Verified /var/run/docker.sock permissions: 660 root:docker"

echo ""
echo "[+] 4. Auditing Container Isolation & Host Protection (altrix_backend)..."
if docker ps -q -f name=altrix_backend >/dev/null; then
  PRIV_STATE=$(docker inspect altrix_backend --format '{{.HostConfig.Privileged}}')
  NET_MODE=$(docker inspect altrix_backend --format '{{.HostConfig.NetworkMode}}')
  PORT_BINDINGS=$(docker inspect altrix_backend --format '{{json .HostConfig.PortBindings}}')
  MOUNTS=$(docker inspect altrix_backend --format '{{json .Mounts}}')
  CONTAINER_STATUS=$(docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})')

  echo "    - Status: $CONTAINER_STATUS"
  echo "    - Privileged Mode: $PRIV_STATE (Expected: false)"
  echo "    - Network Isolation: $NET_MODE (Expected: isolated bridge)"
  echo "    - Host Mounts: $MOUNTS (Expected: zero sensitive host mounts)"
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

echo -n "    AltRix Backend Container: "
docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})' || echo "N/A"

echo -n "    Production HTTPS (/): "
curl -Is https://altrixcore.com | head -n 1

echo -n "    Production Health (/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health

echo -n "    Production API Health (/api/health): "
curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 19H COMPLETE: DOCKER ISOLATION HARDENING APPLIED         "
echo "================================================================="
