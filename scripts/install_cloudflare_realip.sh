#!/bin/sh
# Make nginx see the visitor's own address behind Cloudflare, so per-IP limits
# are per visitor rather than per Cloudflare edge server.
set -e
OUT=/etc/nginx/conf.d/98-cloudflare-realip.conf
TMP=$(mktemp)
V4=$(curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 15 https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] && [ -n "$V6" ] || { echo "could not fetch Cloudflare ranges"; exit 1; }
{
  echo "# Visitors reach this server through Cloudflare. Without this, \$remote_addr"
  echo "# is a Cloudflare edge address, so the per-IP request limit"
  echo "# (zone altrix_edge_api, 30 r/s burst 50) was shared by every user behind"
  echo "# the same edge, and a busy school tripped it for everyone (429s)."
  echo "# The visitor's address is taken from CF-Connecting-IP, and only when the"
  echo "# connection really comes from Cloudflare, so it cannot be spoofed."
  echo "# Ranges from https://www.cloudflare.com/ips-v4 and ips-v6, $(date -u +%F)."
  for r in $V4 $V6; do echo "set_real_ip_from $r;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > "$TMP"
[ -f "$OUT" ] && cp "$OUT" "$OUT.bak.$(date +%s)"
cp "$TMP" "$OUT"
rm -f "$TMP"
if nginx -t 2>&1; then
  systemctl reload nginx
  echo "RELOADED with $(grep -c set_real_ip_from $OUT) ranges"
else
  echo "nginx -t failed; removing the new file"
  rm -f "$OUT"
  nginx -t && systemctl reload nginx
  exit 1
fi
