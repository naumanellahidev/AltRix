#!/bin/bash
set -e

cat << 'EOF' > /etc/altrix/proxy/snippets/static_caching.conf
location ~* ^/(favicon\.ico|altrix-icon\.png|altrix-logo\.png)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires 0;
}

location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff|woff2|ttf|eot)$ {
    expires 1y;
    access_log off;
    add_header Cache-Control "public, immutable";
    include /etc/altrix/proxy/headers/security_headers.conf;
}
EOF

nginx -t
systemctl reload nginx
echo "Nginx favicon cache configuration updated & reloaded successfully!"
