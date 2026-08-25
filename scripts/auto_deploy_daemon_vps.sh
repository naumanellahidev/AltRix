#!/usr/bin/env bash
# ==============================================================================
# Altrix Core — Auto-Deployment Daemon (GitHub -> VPS Sync Engine)
# ==============================================================================
set -euo pipefail

REPO_DIR="/opt/altrix/repo"
CURRENT_SYMLINK="/opt/altrix/current"

mkdir -p /opt/altrix/logs/deployments /opt/altrix/scripts
git config --global --add safe.directory "*" || true

if [ ! -d "${REPO_DIR}/.git" ]; then
    echo "[DAEMON] Initializing repository at ${REPO_DIR}..."
    rm -rf "${REPO_DIR}"
    git clone https://github.com/farhathashmireflections-sys/Altrix-2.git "${REPO_DIR}" || git clone https://github.com/naumanellahidev/AltRix.git "${REPO_DIR}"
fi

cd "${REPO_DIR}"
git config --global --add safe.directory "${REPO_DIR}" || true
git remote add altrix2 https://github.com/farhathashmireflections-sys/Altrix-2.git 2>/dev/null || true

echo "[DAEMON] GitHub -> VPS Auto-Deployment Daemon active. Polling main branch..."

while true; do
    cd "${REPO_DIR}"
    git config --global --add safe.directory "*" || true
    GIT_TERMINAL_PROMPT=0 git fetch altrix2 main >/dev/null 2>&1 || GIT_TERMINAL_PROMPT=0 git fetch origin main >/dev/null 2>&1 || true
    
    REMOTE_SHA=$(git rev-parse altrix2/main 2>/dev/null || git rev-parse origin/main 2>/dev/null || echo "")
    LOCAL_SHA=""
    if [ -f "${CURRENT_SYMLINK}/COMMIT_SHA" ]; then
        LOCAL_SHA=$(cat "${CURRENT_SYMLINK}/COMMIT_SHA" 2>/dev/null | tr -d '\n\r' || echo "")
    fi

    if [ -n "${REMOTE_SHA}" ] && [ "${REMOTE_SHA}" != "${LOCAL_SHA}" ]; then
        echo "[DAEMON] New GitHub commit detected: ${REMOTE_SHA:0:12} (VPS Current: ${LOCAL_SHA:0:12}). Triggering auto-deploy..."
        git archive "${REMOTE_SHA}" scripts/deploy.sh | tar -x -O > /opt/altrix/scripts/deploy.sh 2>/dev/null || cp -p "${REPO_DIR}/scripts/deploy.sh" /opt/altrix/scripts/deploy.sh 2>/dev/null || true
        chmod +x /opt/altrix/scripts/deploy.sh 2>/dev/null || true
        /opt/altrix/scripts/deploy.sh "${REMOTE_SHA}" || echo "[DAEMON ERROR] Auto-deployment failed for commit ${REMOTE_SHA}"
    fi

    sleep 15
done
