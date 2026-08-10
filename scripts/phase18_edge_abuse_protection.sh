#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 18: Edge Request Abuse & Resource-Exhaustion
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 18: Edge Request Abuse & Resource-Exhaustion Protection "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/etc/nginx/backup_phase18_$TIMESTAMP"

echo "[+] 1. Creating Timestamped Nginx Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/nginx/nginx.conf "$BACKUP_DIR/"
cp -r /etc/nginx/conf.d "$BACKUP_DIR/"
if [ -d /etc/altrix/proxy ]; then
  cp -r /etc/altrix/proxy "$BACKUP_DIR/"
fi
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Deploying Edge Connection & Rate Protection Zones..."
CONF_DROPIN="/etc/nginx/conf.d/99-altrix-edge-protection.conf"

cat << 'EOF' > "$CONF_DROPIN"
# ==============================================================================
# AltRix Production Edge Request Abuse & Connection Protection
# Drop-in: /etc/nginx/conf.d/99-altrix-edge-protection.conf
# ==============================================================================

# Per-IP Connection Limiting Zone (20MB memory holds ~320,000 IP states)
limit_conn_zone $binary_remote_addr zone=altrix_perip_conn:20m;

# Per-IP Request Rate Limiting Zone for General API (30 req/s with burst=50 nodelay)
# Allows smooth multi-user NAT & bursty UI/API requests while blocking automated floods
limit_req_zone $binary_remote_addr zone=altrix_edge_api:20m rate=30r/s;

# Return HTTP 429 Too Many Requests instead of default 503
limit_req_status 429;
limit_conn_status 429;
EOF

chmod 644 "$CONF_DROPIN"
echo "    Created $CONF_DROPIN"

echo ""
echo "[+] 3. Applying Edge Rate & Connection Limits to AltRix Virtual Host..."
VHOST_CONF="/etc/altrix/proxy/sites-available/altrix.conf"

cat << 'EOF' > "$VHOST_CONF"
# AltRix Production Nginx Configuration - Phase 18
# Dedicated Virtual-Host Architecture with Edge Abuse Protection

# =========================================================================
# 1. HTTP Server Block - altrixcore.com & www.altrixcore.com
# Handles ACME challenges and redirects all HTTP traffic to canonical HTTPS
# =========================================================================
server {
    listen 80;
    listen [::]:80;
    server_name altrixcore.com www.altrixcore.com;

    # ACME Challenge for Let's Encrypt automated verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://altrixcore.com$request_uri;
    }
}

# =========================================================================
# 2. HTTPS Server Block - www.altrixcore.com (Canonical WWW Redirection)
# Redirects https://www.altrixcore.com -> https://altrixcore.com
# =========================================================================
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.altrixcore.com;

    ssl_certificate /etc/letsencrypt/live/altrixcore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/altrixcore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://altrixcore.com$request_uri;
}

# =========================================================================
# 3. Canonical HTTPS Primary Virtual Host - altrixcore.com
# Hosts AltRix Frontend SPA & Reverse Proxies Backend API
# =========================================================================
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name altrixcore.com;

    root /opt/altrix/current/dist;
    index index.html;

    access_log /etc/altrix/proxy/logs/altrix_access.log;
    error_log  /etc/altrix/proxy/logs/altrix_error.log;

    client_max_body_size 100M;
    include /etc/altrix/proxy/snippets/compression.conf;

    # Let's Encrypt TLS Certificate & Hardened TLS Parameters
    ssl_certificate /etc/letsencrypt/live/altrixcore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/altrixcore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    include /etc/altrix/proxy/headers/security_headers.conf;

    # Backend API reverse proxy (with Edge Abuse & Connection Limits)
    location /api/ {
        limit_req zone=altrix_edge_api burst=50 nodelay;
        limit_conn altrix_perip_conn 50;

        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        include /etc/altrix/proxy/headers/security_headers.conf;
    }

    # Health Check Endpoint Proxy (Exempt from strict rate limits for monitoring)
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }

    # OpenAPI Docs Proxy
    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_set_header Host $host;
    }
    location /openapi.json {
        proxy_pass http://127.0.0.1:8000/openapi.json;
        proxy_set_header Host $host;
    }

    # Static SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
        include /etc/altrix/proxy/headers/security_headers.conf;
    }

    include /etc/altrix/proxy/snippets/static_caching.conf;
}

# =========================================================================
# 4. Default Server Block (Raw IP / Direct VPS Access)
# =========================================================================
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 169.58.111.159 _;

    root /opt/altrix/current/dist;
    index index.html;

    client_max_body_size 100M;
    include /etc/altrix/proxy/snippets/compression.conf;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

chmod 644 "$VHOST_CONF"
echo "    Updated $VHOST_CONF"

echo ""
echo "[+] 4. Validating Nginx Configuration Syntax..."
if nginx -t; then
  echo "    Nginx configuration syntax: SUCCESS"
  echo "    Reloading Nginx gracefully..."
  systemctl reload nginx
else
  echo "[-] Nginx configuration syntax test FAILED! Rolling back..."
  cp "$BACKUP_DIR/nginx.conf" /etc/nginx/nginx.conf
  cp -r "$BACKUP_DIR/conf.d/"* /etc/nginx/conf.d/
  cp -r "$BACKUP_DIR/proxy/"* /etc/altrix/proxy/
  rm -f "$CONF_DROPIN"
  exit 1
fi

echo ""
echo "[+] 5. Targeted Live Verification..."
echo -n "    Nginx service status: "
systemctl is-active nginx

echo -n "    Testing HTTP -> HTTPS Redirect: "
curl -Is http://altrixcore.com | head -n 1

echo -n "    Testing HTTPS Homepage: "
curl -Is https://altrixcore.com | head -n 1

echo -n "    Testing Health Endpoint Proxy (/health): "
curl -Is https://altrixcore.com/health | head -n 1

echo -n "    Testing API Health Endpoint Proxy (/api/health): "
curl -Is https://altrixcore.com/api/health | head -n 1

echo ""
echo "[+] 6. Performing Controlled Rate-Limit Validation Test..."
echo "    Sending burst of 65 requests to /api/health to observe rate-limiting (30r/s + burst=50)..."
RESP_CODES=$(python3 -c "
import urllib.request, concurrent.futures, collections
def fetch(i):
    try:
        req = urllib.request.Request('http://127.0.0.1:80/api/health', headers={'Host': 'altrixcore.com'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as ex:
        return str(ex)

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(fetch, range(65)))

counts = collections.Counter(results)
print('    Response code counts across 65 concurrent requests:', dict(counts))
" 2>/dev/null || echo "    Python rate-limit test completed")
echo "$RESP_CODES"

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
echo "  PHASE 18 COMPLETE: EDGE ABUSE PROTECTION APPLIED               "
echo "================================================================="
