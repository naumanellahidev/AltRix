#!/bin/bash
# Nginx Static Caching and Asset Fallback Configuration (Phase 20D)
set -e

echo "[INFO] Updating Nginx static caching snippet..."

cat << 'EOF' > /etc/altrix/proxy/snippets/static_caching.conf
# 1. Never cache index.html, sw.js, manifest, version.json, or root images/favicons
location ~* ^/(index\.html|sw\.js|version\.json|workbox-.*\.js|manifest\.webmanifest|favicon\.ico|altrix-icon\.png|altrix-logo\.png)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    expires 0;
    include /etc/altrix/proxy/headers/security_headers.conf;
}

# 2. Immutable cache for hashed JS bundles with fallback to prevent PWA install/update 404 blocks
location ~* ^/assets/.*\.js$ {
    expires 1y;
    access_log off;
    add_header Cache-Control "public, immutable" always;
    include /etc/altrix/proxy/headers/security_headers.conf;
    try_files $uri /assets/fallback.js =404;
}

# 3. Immutable cache for hashed CSS bundles with fallback to prevent PWA install/update 404 blocks
location ~* ^/assets/.*\.css$ {
    expires 1y;
    access_log off;
    add_header Cache-Control "public, immutable" always;
    include /etc/altrix/proxy/headers/security_headers.conf;
    try_files $uri /assets/fallback.css =404;
}

# 4. Immutable cache for all other assets
location ~* ^/assets/.*\.(?:jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff|woff2|ttf|eot)$ {
    expires 1y;
    access_log off;
    add_header Cache-Control "public, immutable" always;
    include /etc/altrix/proxy/headers/security_headers.conf;
}
EOF

echo "[INFO] Testing Nginx configuration..."
nginx -t

echo "[INFO] Reloading Nginx..."
systemctl reload nginx

echo "[SUCCESS] Nginx caching and asset fallback configuration updated & reloaded!"
