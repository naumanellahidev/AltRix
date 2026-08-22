#!/usr/bin/env bash
# ==============================================================================
# AltriX Mail Platform - Nginx Subdomain Setup (mail.altrixcore.com)
# ==============================================================================
set -euo pipefail

echo "===================================================================="
echo ">>> Setting up Nginx Virtual Host for mail.altrixcore.com..."
echo "===================================================================="

# 1. Ensure certbot webroot directory exists
mkdir -p /var/www/html/.well-known/acme-challenge
chown -R www-data:www-data /var/www/html

# 2. Write HTTP bootstrap config for SSL issuance
cat > /etc/nginx/sites-available/mail.altrixcore.com.conf << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name mail.altrixcore.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/mail.altrixcore.com.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 3. Obtain SSL Certificate with Certbot
echo ">>> Obtaining SSL Certificate for mail.altrixcore.com via Certbot..."
certbot certonly --webroot -w /var/www/html -d mail.altrixcore.com --non-interactive --agree-tos --register-unsafely-without-email || true

# 4. Write Complete Production HTTPS Virtual Host
cat > /etc/nginx/sites-available/mail.altrixcore.com.conf << 'EOF'
# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name mail.altrixcore.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Canonical HTTPS Virtual Host
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name mail.altrixcore.com;

    # SSL Certificate
    ssl_certificate /etc/letsencrypt/live/mail.altrixcore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.altrixcore.com/privkey.pem;

    # If certbot fallback is needed, use existing cert
    # ssl_certificate /etc/letsencrypt/live/altrixcore.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/altrixcore.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50M;

    # 1. Roundcube Webmail Gateway
    location /webmail/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }

    # 2. Control Center REST API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # 3. Control Center Frontend SPA & Direct Routes (/login, /domains, /mailboxes, etc.)
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

# 5. Test & Reload Nginx
echo ">>> Verifying Nginx configuration syntax..."
nginx -t
systemctl reload nginx

echo "===================================================================="
echo ">>> SUCCESS! https://mail.altrixcore.com is now live and working!"
echo "===================================================================="
