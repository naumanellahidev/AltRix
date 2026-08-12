#!/usr/bin/env bash
# ==============================================================================
# AltRix SaaS ERP — Auto-Deployment Daemon (GitHub -> VPS Sync Engine)
# ==============================================================================
set -euo pipefail

REPO_DIR="/opt/altrix/repo"
CURRENT_SYMLINK="/opt/altrix/current"

mkdir -p /opt/altrix/logs/deployments

if [ ! -d "${REPO_DIR}/.git" ]; then
    echo "[DAEMON] Initializing repository at ${REPO_DIR}..."
    git clone https://github.com/naumanellahidev/AltRix.git "${REPO_DIR}"
fi

echo "[DAEMON] GitHub -> VPS Auto-Deployment Daemon active. Polling origin/main..."

while true; do
    cd "${REPO_DIR}"
    git fetch origin main >/dev/null 2>&1 || true
    
    REMOTE_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
    LOCAL_SHA=""
    if [ -f "${CURRENT_SYMLINK}/COMMIT_SHA" ]; then
        LOCAL_SHA=$(cat "${CURRENT_SYMLINK}/COMMIT_SHA" 2>/dev/null | tr -d '\n\r' || echo "")
    fi

    if [ -n "${REMOTE_SHA}" ] && [ "${REMOTE_SHA}" != "${LOCAL_SHA}" ]; then
        echo "[DAEMON] New GitHub commit detected: ${REMOTE_SHA:0:12} (VPS Current: ${LOCAL_SHA:0:12}). Triggering auto-deploy..."
        /opt/altrix/scripts/deploy.sh "${REMOTE_SHA}" || echo "[DAEMON ERROR] Auto-deployment failed for commit ${REMOTE_SHA}"
    fi

    sleep 30
done
