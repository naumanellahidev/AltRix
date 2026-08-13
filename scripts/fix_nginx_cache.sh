#!/bin/bash
set -e

cat << 'EOF' > /etc/altrix/proxy/snippets/static_caching.conf
# 1. Never cache index.html, sw.js, manifest, version.json, or root images/favicons
location ~* ^/(index\.html|sw\.js|version\.json|workbox-.*\.js|manifest\.webmanifest|favicon\.ico|altrix-icon\.png|altrix-logo\.png)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    expires 0;
    include /etc/altrix/proxy/headers/security_headers.conf;
}

# 2. Immutable cache for hashed production build bundles inside /assets/
location ~* ^/assets/.*\.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff|woff2|ttf|eot)$ {
    expires 1y;
    access_log off;
    add_header Cache-Control "public, immutable" always;
    include /etc/altrix/proxy/headers/security_headers.conf;
}
EOF

nginx -t
systemctl reload nginx
echo "Nginx caching configuration updated cleanly & reloaded!"
