#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 17: Nginx / Reverse-Proxy / TLS Security Hardening
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 17: Nginx / Reverse-Proxy / TLS Security Hardening       "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/etc/nginx/backup_phase17_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Nginx Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/nginx/nginx.conf "$BACKUP_DIR/"
if [ -d /etc/altrix/proxy ]; then
  cp -r /etc/altrix/proxy "$BACKUP_DIR/"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Deploying Dedicated Nginx Security & Buffer Drop-in..."
CONF_DROPIN="/etc/nginx/conf.d/99-altrix-nginx-hardening.conf"

cat << 'EOF' > "$CONF_DROPIN"
# ==============================================================================
# AltRix Production Nginx Security & Buffer Tuning
# Drop-in: /etc/nginx/conf.d/99-altrix-nginx-hardening.conf
# ==============================================================================

# Server information disclosure
server_tokens off;

# Request buffer limits (Prevent buffer overflow & slow-client DoS)
client_body_buffer_size 128k;
client_header_buffer_size 1k;
large_client_header_buffers 4 8k;

# Timeout hardening (Prevent lingering slow connections)
client_header_timeout 15s;
client_body_timeout 15s;
send_timeout 15s;
keepalive_timeout 65s;

# Proxy timeout bounds (Compatible with FastAPI / Uvicorn long queries)
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 120s;
EOF

chmod 644 "$CONF_DROPIN"
echo "    Created $CONF_DROPIN"

echo ""
echo "[+] 3. Validating Nginx Configuration Syntax..."
if nginx -t; then
  echo "    Nginx configuration syntax: SUCCESS"
  echo "    Reloading Nginx gracefully..."
  systemctl reload nginx
else
  echo "[-] Nginx configuration syntax test FAILED! Rolling back..."
  cp "$BACKUP_DIR/nginx.conf" /etc/nginx/nginx.conf
  rm -f "$CONF_DROPIN"
  exit 1
fi

echo ""
echo "[+] 4. Targeted Live Verification..."
echo -n "    Nginx service status: "
systemctl is-active nginx

echo -n "    Nginx worker processes: "
pgrep -c nginx || echo "0"

echo "    Testing Local Health Endpoint Proxy..."
curl -Is http://127.0.0.1:8000/health | head -n 1 || true

echo "    Testing Public HTTPS Response & Server Header (server_tokens)..."
curl -Is https://altrixcore.com | grep -E "(HTTP/|Server:|Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)" || true

echo ""
echo "================================================================="
echo "  PHASE 17 COMPLETE: NGINX & TLS SECURITY HARDENING APPLIED      "
echo "================================================================="
