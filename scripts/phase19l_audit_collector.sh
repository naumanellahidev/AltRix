#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Hardening - Phase 19L: Real Live Forensic Security Audit Collector
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Read-Only Forensic Evidence Gathering
# ==============================================================================

set -uo pipefail

OUT_DIR="/tmp/altrix_security_audit_19L"
mkdir -p "$OUT_DIR"

log_cmd() {
    local tag="$1"
    shift
    echo "=== $tag ===" > "$OUT_DIR/$tag.txt"
    echo "TIMESTAMP: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$OUT_DIR/$tag.txt"
    echo "COMMAND: $*" >> "$OUT_DIR/$tag.txt"
    echo "--- RAW OUTPUT ---" >> "$OUT_DIR/$tag.txt"
    eval "$*" >> "$OUT_DIR/$tag.txt" 2>&1 || true
}

echo "[+] 1. Collecting Live Host Identity..."
log_cmd "00_identity" "hostname; hostname -I; whoami; id; sudo -n id; uname -a; cat /etc/os-release | grep -E '(PRETTY_NAME|VERSION_ID)'"

echo "[+] 2. Collecting OS Baseline & Service Evidence (16A)..."
log_cmd "16A_os_services" "timedatectl; sudo aa-status 2>&1 | head -n 15; systemctl --failed --no-pager; systemctl list-unit-files --state=enabled --no-pager | head -n 30"

echo "[+] 3. Collecting Sysctl Runtime Parameters (16B)..."
log_cmd "16B_sysctl" "sysctl kernel.randomize_va_space kernel.yama.ptrace_scope kernel.kptr_restrict kernel.dmesg_restrict net.ipv4.ip_forward net.ipv4.conf.all.accept_redirects net.ipv4.conf.default.accept_redirects net.ipv4.conf.all.send_redirects net.ipv4.conf.all.accept_source_route net.ipv4.icmp_echo_ignore_broadcasts net.ipv4.tcp_syncookies fs.file-max net.core.somaxconn net.ipv4.tcp_keepalive_time net.ipv4.tcp_max_tw_buckets net.ipv4.ip_local_port_range"

echo "[+] 4. Collecting Systemd & Journal Evidence (16C)..."
log_cmd "16C_systemd_journal" "journalctl --disk-usage; grep -rnE '(SystemMaxUse|RuntimeMaxUse|Storage|Compress)' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/ 2>/dev/null"

echo "[+] 5. Collecting Filesystem & SUID Evidence (16D)..."
log_cmd "16D_fs_suid" "find /usr/local /home/altrixadmin /etc -perm /6000 -type f 2>/dev/null; find /etc /usr/local /home/altrixadmin -xdev -type f -perm -0002 2>/dev/null; ls -ld /tmp /var/tmp /home/altrixadmin /home/altrixadmin/.ssh /home/altrixadmin/.ssh/authorized_keys"

echo "[+] 6. Collecting Listening Sockets (16E)..."
log_cmd "16E_network_sockets" "sudo ss -lntup; sudo ss -lnup"

echo "[+] 7. Collecting Resource & Capacity Limits (16F)..."
log_cmd "16F_capacity_limits" "ulimit -n; cat /proc/sys/fs/file-max; cat /proc/sys/net/core/somaxconn; grep -rnE '(nofile|nproc)' /etc/security/limits.conf /etc/security/limits.d/ 2>/dev/null"

echo "[+] 8. Collecting Network Resilience & Socket Stats (16G)..."
log_cmd "16G_resilience" "cat /proc/net/sockstat; ss -s"

echo "[+] 9. Collecting Storage, Inode & Log Limits (16H)..."
log_cmd "16H_storage_logs" "df -h; df -i; sudo docker system df 2>/dev/null; cat /etc/docker/daemon.json"

echo "[+] 10. Collecting Nginx & TLS Configuration (17)..."
log_cmd "17_nginx_tls" "sudo nginx -t; grep -rnE '(server_tokens|ssl_protocols|limit_req|limit_conn)' /etc/nginx/ /etc/altrix/proxy/ 2>/dev/null"

echo "[+] 11. Collecting Firewall Rules & Forwarding Chains (18)..."
log_cmd "18_firewall" "sudo ufw status verbose; sudo ufw status numbered; sudo iptables -S DOCKER-USER 2>/dev/null; sudo iptables -L INPUT -n --line-numbers | head -n 25"

echo "[+] 12. Collecting SSH Daemon Runtime Negotiation (19A-E)..."
log_cmd "19A_ssh" "sudo sshd -T | grep -E '(permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|maxauthtries|maxsessions|ciphers|macs|kexalgorithms|port|allowtcpforwarding|x11forwarding|clientaliveinterval|clientalivecountmax|maxstartups)' | sort"

echo "[+] 13. Collecting Fail2Ban Active Jails & State (19F)..."
log_cmd "19F_fail2ban" "sudo fail2ban-client status; sudo fail2ban-client status sshd; sudo fail2ban-client status recidive; sudo cat /etc/fail2ban/jail.d/*.local"

echo "[+] 14. Collecting Auto-Updates & Reboot Monitor (19G)..."
log_cmd "19G_updates" "systemctl list-timers | grep -E '(apt|altrix)'; cat /var/log/altrix/reboot-required.log; cat /etc/apt/apt.conf.d/20auto-upgrades /etc/apt/apt.conf.d/52altrix-security-upgrades 2>/dev/null"

echo "[+] 15. Collecting Docker Daemon & Container Isolation (19H)..."
log_cmd "19H_docker" "sudo docker info --format '{{json .SecurityOptions}}'; sudo docker inspect altrix_backend --format 'Name: {{.Name}} | Image: {{.Config.Image}} | User: {{.Config.User}} | Privileged: {{.HostConfig.Privileged}} | CapAdd: {{json .HostConfig.CapAdd}} | CapDrop: {{json .HostConfig.CapDrop}} | Mounts: {{json .Mounts}} | PortBindings: {{json .HostConfig.PortBindings}} | NetworkMode: {{.HostConfig.NetworkMode}} | RestartPolicy: {{json .HostConfig.RestartPolicy}} | Health: {{json .State.Health.Status}} | Status: {{.State.Status}}'; ls -la /var/run/docker.sock"

echo "[+] 16. Collecting Sudo Hardening & Privileges (19I)..."
log_cmd "19I_sudo" "sudo visudo -c; sudo -n id; ls -la /etc/sudoers /etc/sudoers.d/; sudo cat /etc/sudoers.d/00_altrix_sudo_security"

echo "[+] 17. Collecting Backup & Recovery Artifacts (19J)..."
log_cmd "19J_backups" "systemctl is-active altrix-backup.timer; ls -la /var/backups/altrix/; cat /var/backups/altrix/*.sha256; head -n 25 /var/backups/altrix/RECOVERY_MANIFEST.md"

echo "[+] 18. Collecting Live TLS & Health Responses (19K)..."
log_cmd "19K_cert_https" "curl -sIv https://altrixcore.com 2>&1 | head -n 35; curl -s -o /dev/null -w 'HTTP_CODE: %{http_code}\n' https://altrixcore.com/health; curl -s -o /dev/null -w 'HTTP_CODE: %{http_code}\n' https://altrixcore.com/api/health"

echo "[+] 19. Auditing Standard Directories for Exposed Secrets..."
log_cmd "secrets_audit" "find /etc/nginx /etc/fail2ban /var/log/altrix -type f -exec grep -lE '(BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|eyJhbGciOi)' {} + 2>/dev/null || echo 'No private keys/JWT exposed in standard audit paths'"

echo "[+] 20. Checking Production Services Status..."
log_cmd "production_health" "systemctl is-active ssh; systemctl is-active docker; systemctl is-active nginx; systemctl is-active fail2ban; sudo docker ps"

echo "[+] Evidence collection complete in $OUT_DIR"
