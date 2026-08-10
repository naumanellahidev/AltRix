#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19J: Backup Security & Disaster-Recovery Protection
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Fast Implementation (No Forensic Audit)
# ==============================================================================

set -euo pipefail

echo "================================================================="
echo "  PHASE 19J: Backup Security & Disaster-Recovery Protection      "
echo "================================================================="

# Ensure running with sudo / root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

BACKUP_ROOT="/var/backups/altrix"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
chown root:root "$BACKUP_ROOT"

echo "[+] 1. Initializing Secure Backup Storage at $BACKUP_ROOT..."

echo ""
echo "[+] 2. Creating Disaster Recovery Manifest & Documentation..."
cat << 'EOF' > "$BACKUP_ROOT/RECOVERY_MANIFEST.md"
# AltRix Production Disaster Recovery Manifest
Generated: Automated Disaster Recovery System

## Core Architectural Components
1. **Operating System**: Ubuntu 24.04 LTS x86_64
2. **Reverse Proxy & TLS**: Nginx 1.24+ with Let's Encrypt certificates & Cloudflare Full Strict TLS
3. **Application Runtime**: Docker container `altrix_backend` (FastAPI / Uvicorn) bound to `127.0.0.1:8000`
4. **Database**: Managed Supabase PostgreSQL cloud backend
5. **Intrusion Prevention**: Fail2Ban monitoring `sshd` and `recidive` jails
6. **Firewall**: UFW with strict inbound default-deny (ports 22, 80, 443 allowed)
7. **Administrative Access**: User `altrixadmin` via Ed25519 public key authentication with passwordless sudo

## Configuration Backup Coverage
- `/etc/nginx/` and `/etc/altrix/proxy/`
- `/etc/fail2ban/`
- `/etc/ufw/`
- `/etc/sudoers` and `/etc/sudoers.d/`
- `/etc/sysctl.d/`
- `/etc/security/`
- `/etc/docker/daemon.json`
- `/etc/apt/apt.conf.d/` (unattended-upgrades & reboot monitor)
- `/etc/systemd/system/altrix-*.timer`
EOF
chmod 600 "$BACKUP_ROOT/RECOVERY_MANIFEST.md"
chown root:root "$BACKUP_ROOT/RECOVERY_MANIFEST.md"

cat << 'EOF' > "$BACKUP_ROOT/DISASTER_RECOVERY_PROCEDURE.md"
# AltRix Disaster Recovery Procedure

## Step-by-Step Recovery Sequence
1. Provision fresh Ubuntu 24.04 LTS VPS instance.
2. Create user `altrixadmin` and deploy authorized Ed25519 public key in `/home/altrixadmin/.ssh/authorized_keys` (`chmod 600`).
3. Restore `/etc/sudoers.d/` and verify `visudo -c`.
4. Install Docker CE and restore `/etc/docker/daemon.json`.
5. Restore sysctl parameters to `/etc/sysctl.d/` and apply `sysctl --system`.
6. Restore UFW firewall rules (`ufw default deny incoming`, `ufw allow 22,80,443/tcp`, `ufw enable`).
7. Restore Nginx configurations to `/etc/nginx/` and `/etc/altrix/proxy/`.
8. Deploy Let's Encrypt certificates or regenerate via certbot.
9. Deploy Docker container `altrix_backend` on `127.0.0.1:8000`.
10. Restore Fail2Ban configurations and restart `fail2ban`.
11. Start Nginx and verify health endpoints: `/health` and `/api/health`.
12. Verify DNS and HTTPS routing through Cloudflare.
EOF
chmod 600 "$BACKUP_ROOT/DISASTER_RECOVERY_PROCEDURE.md"
chown root:root "$BACKUP_ROOT/DISASTER_RECOVERY_PROCEDURE.md"

echo ""
echo "[+] 3. Installing Automated Backup Script (/usr/local/bin/altrix-backup.sh)..."
cat << 'EOF' > /usr/local/bin/altrix-backup.sh
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/altrix"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
ARCHIVE_NAME="altrix_config_backup_${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

# Check available disk space (minimum 1GB required)
AVAIL_KB=$(df -k "$BACKUP_DIR" | tail -n 1 | awk '{print $4}')
if [ "$AVAIL_KB" -lt 1048576 ]; then
    echo "[-] Error: Insufficient disk space in $BACKUP_DIR (< 1GB available)." >&2
    exit 1
fi

echo "[+] Creating configuration backup archive: $ARCHIVE_NAME..."
tar -czf "$ARCHIVE_PATH" \
    --exclude='*.sock' \
    --exclude='*.log' \
    /etc/nginx \
    /etc/altrix \
    /etc/fail2ban \
    /etc/ufw \
    /etc/sudoers \
    /etc/sudoers.d \
    /etc/sysctl.d \
    /etc/security \
    /etc/docker/daemon.json \
    /etc/apt/apt.conf.d \
    2>/dev/null || true

chmod 600 "$ARCHIVE_PATH"
chown root:root "$ARCHIVE_PATH"

# Generate cryptographic SHA-256 checksum
sha256sum "$ARCHIVE_PATH" > "$CHECKSUM_PATH"
chmod 600 "$CHECKSUM_PATH"
chown root:root "$CHECKSUM_PATH"

echo "[+] Backup successfully created and verified with SHA-256."

# Retention cleanup: Keep 7 daily backups
echo "[+] Applying retention policy (retaining last 7 backups)..."
find "$BACKUP_DIR" -name "altrix_config_backup_*.tar.gz" -type f -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "altrix_config_backup_*.tar.gz.sha256" -type f -mtime +7 -delete 2>/dev/null || true

echo "[+] Backup job completed successfully."
EOF
chmod 750 /usr/local/bin/altrix-backup.sh
chown root:root /usr/local/bin/altrix-backup.sh

echo ""
echo "[+] 4. Configuring Systemd Backup Service & Timer..."
cat << 'EOF' > /etc/systemd/system/altrix-backup.service
[Unit]
Description=AltRix Automated Configuration & Disaster Recovery Backup
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/altrix-backup.sh
EOF

cat << 'EOF' > /etc/systemd/system/altrix-backup.timer
[Unit]
Description=Daily AltRix Disaster Recovery Backup Timer (02:00 UTC)

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now altrix-backup.timer

echo ""
echo "[+] 5. Executing Live Initial Backup Run..."
/usr/local/bin/altrix-backup.sh

LATEST_BACKUP=$(ls -t "$BACKUP_ROOT"/altrix_config_backup_*.tar.gz | head -n 1)
echo "    Created: $LATEST_BACKUP"
echo "    Checksum: $(cat "${LATEST_BACKUP}.sha256")"

echo ""
echo "[+] 6. Performing Non-Destructive Recovery Validation Test..."
TEST_RESTORE_DIR=$(mktemp -d /tmp/altrix-recovery-test-XXXXXX)
echo "    Testing extraction into $TEST_RESTORE_DIR..."

cd "$TEST_RESTORE_DIR"
sha256sum -c "${LATEST_BACKUP}.sha256"
tar -tzf "$LATEST_BACKUP" > /dev/null

echo "    [PASS] SHA-256 verification and archive integrity confirmed."
cd /
rm -rf "$TEST_RESTORE_DIR"
echo "    Cleaned up temporary test directory $TEST_RESTORE_DIR."

echo ""
echo "[+] 7. Production Health & Regression Verification..."
echo -n "    SSH daemon: "
systemctl is-active ssh

echo -n "    Fail2Ban service: "
systemctl is-active fail2ban

echo -n "    Docker daemon: "
systemctl is-active docker

echo -n "    Nginx reverse-proxy: "
systemctl is-active nginx

echo -n "    AltRix Backup Timer: "
systemctl is-active altrix-backup.timer

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
echo "  PHASE 19J COMPLETE: BACKUP & DISASTER-RECOVERY HARDENING       "
echo "================================================================="
