#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19G: Automatic Security Updates & Kernel Patching
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19G: Automatic Security Updates & Kernel Patching        "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/apt_phase19g_$TIMESTAMP"

echo "[+] 1. Creating Timestamped APT Configuration Backup..."
mkdir -p "$BACKUP_DIR"
cp -r /etc/apt/apt.conf.d "$BACKUP_DIR/"
echo "    Backup created at $BACKUP_DIR"

echo ""
echo "[+] 2. Configuring Periodic Auto-Upgrades (/etc/apt/apt.conf.d/20auto-upgrades)..."
cat << 'EOF' > /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
chmod 644 /etc/apt/apt.conf.d/20auto-upgrades

echo ""
echo "[+] 3. Enforcing Safe Unattended-Upgrades & No Automatic Reboot..."
# Ensure security origins are enabled and Automatic-Reboot is explicitly false
cat << 'EOF' > /etc/apt/apt.conf.d/52altrix-security-upgrades
// AltRix Production Safe Security Updates Configuration - Phase 19G
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};

// Exclude unstable package upgrades
Unattended-Upgrade::Package-Blacklist {
};

// Production Reboot Safety: NEVER automatically reboot production VPS
Unattended-Upgrade::Automatic-Reboot "false";

// Clean up unused dependency packages automatically
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "false";

// Syslog reporting
Unattended-Upgrade::SyslogEnable "true";
EOF
chmod 644 /etc/apt/apt.conf.d/52altrix-security-upgrades

echo ""
echo "[+] 4. Creating Machine-Readable Reboot-Required Monitoring..."
mkdir -p /var/log/altrix

cat << 'EOF' > /usr/local/bin/altrix-check-reboot.sh
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/altrix/reboot-required.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CURRENT_KERNEL=$(uname -r)

if [ -f /var/run/reboot-required ]; then
    PKGS="N/A"
    if [ -f /var/run/reboot-required.pkgs ]; then
        PKGS=$(tr '\n' ',' < /var/run/reboot-required.pkgs | sed 's/,$//')
    fi
    echo "{\"timestamp\": \"$TIMESTAMP\", \"reboot_required\": true, \"current_kernel\": \"$CURRENT_KERNEL\", \"packages\": \"$PKGS\"}" >> "$LOG_FILE"
else
    echo "{\"timestamp\": \"$TIMESTAMP\", \"reboot_required\": false, \"current_kernel\": \"$CURRENT_KERNEL\", \"packages\": \"none\"}" >> "$LOG_FILE"
fi
EOF
chmod 750 /usr/local/bin/altrix-check-reboot.sh

cat << 'EOF' > /etc/systemd/system/altrix-reboot-check.service
[Unit]
Description=AltRix Machine-Readable Reboot-Required Monitor
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/altrix-check-reboot.sh
EOF

cat << 'EOF' > /etc/systemd/system/altrix-reboot-check.timer
[Unit]
Description=Run AltRix Reboot-Required Monitor Every 4 Hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=4h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now altrix-reboot-check.timer
/usr/local/bin/altrix-check-reboot.sh

echo "    Reboot check script and systemd timer configured."
echo "    Initial log state: $(tail -n 1 /var/log/altrix/reboot-required.log)"

echo ""
echo "[+] 5. Verifying Active APT Timers & Service Health..."
systemctl is-active apt-daily.timer
systemctl is-active apt-daily-upgrade.timer
systemctl is-active altrix-reboot-check.timer

echo ""
echo "[+] 6. Production Health & Regression Verification..."
echo -n "    SSH daemon: "
systemctl is-active ssh

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo -n "    Docker daemon: "
systemctl is-active docker

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
echo "  PHASE 19G COMPLETE: AUTOMATIC UPDATES HARDENING APPLIED        "
echo "================================================================="
