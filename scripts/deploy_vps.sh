#!/usr/bin/env bash
# ==============================================================================
# AltRix SaaS ERP — Production Permanent CI/CD Deployment Engine
# ==============================================================================
set -euo pipefail

TARGET_SHA="${1:-}"
DEPLOY_TIME=$(date -u +'%Y%m%d-%H%M%S')
LOCK_FILE="/opt/altrix/runtime/deploy.lock"
LOG_DIR="/opt/altrix/logs/deployments"
LOG_FILE="${LOG_DIR}/deploy_${DEPLOY_TIME}.log"
REPO_DIR="/opt/altrix/repo"
RELEASES_DIR="/opt/altrix/releases"
CURRENT_SYMLINK="/opt/altrix/current"

mkdir -p "${LOG_DIR}" /opt/altrix/runtime "${RELEASES_DIR}"

exec 200>"${LOCK_FILE}"
echo "[INFO] Waiting for deployment lock..."
if ! flock -w 900 200; then
    echo "[ERROR] Another deployment is currently in progress and did not finish within 15 minutes. Exiting."
    exit 1
fi
echo "[INFO] Lock acquired. Proceeding with deployment."

exec > >(tee -a "${LOG_FILE}") 2>&1

echo "================================================================="
echo " Starting AltRix Automated Production Deployment"
echo " Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "================================================================="

# 1. Disk & Resource Checks
FREE_SPACE_MB=$(df -m /opt/altrix | awk 'NR==2 {print $4}')
if [ "${FREE_SPACE_MB}" -lt 2000 ]; then
    echo "[ERROR] Insufficient disk space (< 2GB available). Aborting deployment."
    exit 1
fi

if ! systemctl is-active docker >/dev/null 2>&1; then
    echo "[ERROR] Docker engine is not running. Aborting deployment."
    exit 1
fi

# 2. Source Code Sync
if [ ! -d "${REPO_DIR}/.git" ]; then
    echo "[INFO] Initializing main repository clone..."
    rm -rf "${REPO_DIR}"
    git clone https://github.com/naumanellahidev/AltRix.git "${REPO_DIR}"
fi

cd "${REPO_DIR}"
# Add second repo as remote to fetch commits from both sources
git remote add altrix2 https://github.com/farhathashmireflections-sys/Altrix-2.git 2>/dev/null || true
git fetch origin || echo "[WARNING] Fetch from origin failed"
git fetch altrix2 || echo "[WARNING] Fetch from altrix2 failed"

if [ -z "${TARGET_SHA}" ]; then
    TARGET_SHA=$(git rev-parse origin/main)
fi

echo "[INFO] Target GitHub Commit SHA: ${TARGET_SHA}"

if ! git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
    echo "[ERROR] Commit ${TARGET_SHA} not found in repository!"
    exit 1
fi

SHORT_SHA=${TARGET_SHA:0:12}
RELEASE_NAME="release-${SHORT_SHA}-${DEPLOY_TIME}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
mkdir -p "${RELEASE_DIR}"

echo "[INFO] Creating release archive at ${RELEASE_DIR}..."
git archive "${TARGET_SHA}" | tar -x -C "${RELEASE_DIR}"
echo "${TARGET_SHA}" > "${RELEASE_DIR}/COMMIT_SHA"

# 3. Build Frontend
echo "[INFO] Building Node/Vite Frontend..."
cd "${RELEASE_DIR}"
export VITE_COMMIT_SHA="${TARGET_SHA}"

if [ -f package-lock.json ]; then
    npm ci --prefer-offline || npm install
else
    npm install
fi

VITE_COMMIT_SHA="${TARGET_SHA}" npm run build

# Inject version.json into dist
cat <<EOT > "${RELEASE_DIR}/dist/version.json"
{
  "commit": "${TARGET_SHA}",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "environment": "production-vps"
}
EOT

# 3b. Link assets to shared folder to prevent service worker 404s
echo "[INFO] Linking assets to shared folder to prevent service worker 404s..."
mkdir -p /opt/altrix/shared/assets
cp -rp "${RELEASE_DIR}/dist/assets/"* /opt/altrix/shared/assets/ 2>/dev/null || true
rm -rf "${RELEASE_DIR}/dist/assets"
ln -s /opt/altrix/shared/assets "${RELEASE_DIR}/dist/assets"

# Ensure Nginx/www-data has read permissions to the shared assets folder and symlinks
chmod -R 755 /opt/altrix/shared
find /opt/altrix/shared/assets -type f -exec chmod 644 {} + 2>/dev/null || true

# Create fallback files for missing JS/CSS chunks to prevent PWA/Service Worker update failures
echo "[INFO] Creating asset fallbacks to prevent Service Worker installation blocks..."
echo "console.warn('AltRix: SW asset fallback');" > /opt/altrix/shared/assets/fallback.js
echo "/* AltRix: SW asset fallback */" > /opt/altrix/shared/assets/fallback.css
chmod 644 /opt/altrix/shared/assets/fallback.js /opt/altrix/shared/assets/fallback.css

# Align static caching configuration in Nginx
if [ -f "${RELEASE_DIR}/scripts/fix_nginx_cache.sh" ]; then
    echo "[INFO] Running Nginx caching configuration update..."
    bash "${RELEASE_DIR}/scripts/fix_nginx_cache.sh" || echo "[WARNING] Nginx caching config update failed (non-blocking)"
fi

# 4. Copy Environment & Build Docker Backend
echo "[INFO] Preparing Backend Docker Image..."
if [ -f /opt/altrix/shared/config/production.env ]; then
    cp /opt/altrix/shared/config/production.env "${RELEASE_DIR}/backend/.env"
elif [ -f /opt/altrix/config/production.env ]; then
    cp /opt/altrix/config/production.env "${RELEASE_DIR}/backend/.env"
fi

echo "${TARGET_SHA}" > "${RELEASE_DIR}/backend/COMMIT_SHA"

PREV_IMAGE=$(docker inspect -f '{{.Config.Image}}' altrix_backend 2>/dev/null || echo "")

echo "[INFO] Building altrix-backend:${SHORT_SHA}..."
docker build \
    --build-arg GIT_COMMIT_SHA="${TARGET_SHA}" \
    -t "altrix-backend:${SHORT_SHA}" \
    -f backend/Dockerfile \
    backend/

# 5. Swap Backend & Celery Containers
echo "[INFO] Guaranteeing database schema permissions for app user..."
# Try connecting via local postgres user first (if script runs as root)
sudo -u postgres psql -d altrix -c "GRANT USAGE ON SCHEMA auth TO altrix_app; GRANT SELECT ON ALL TABLES IN SCHEMA auth TO altrix_app; ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO altrix_app;" || true

# Try using the admin database URL from vps_postgresql.env or production.env directly (works without passwordless sudo)
for config_file in "/opt/altrix/shared/config/vps_postgresql.env" "/opt/altrix/shared/config/production.env"; do
    if [ -f "${config_file}" ]; then
        ADMIN_URL=$(grep '^VPS_ADMIN_DATABASE_URL=' "${config_file}" | cut -d '=' -f2-)
        if [ -n "${ADMIN_URL}" ]; then
            echo "[INFO] Running schema grants via admin URL from $(basename ${config_file})..."
            psql "${ADMIN_URL}" -c "GRANT USAGE ON SCHEMA auth TO altrix_app; GRANT SELECT ON ALL TABLES IN SCHEMA auth TO altrix_app; ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO altrix_app;" || true
        fi
    fi
done

echo "[INFO] Deploying altrix_backend container..."
docker stop altrix_backend 2>/dev/null || true
docker rm altrix_backend 2>/dev/null || true

docker run -d \
    --name altrix_backend \
    --restart always \
    --network host \
    -e GIT_COMMIT_SHA="${TARGET_SHA}" \
    -e APP_ENV=production \
    -v /opt/altrix/shared/config/production.env:/app/.env:ro \
    "altrix-backend:${SHORT_SHA}"

echo "[INFO] Deploying altrix_celery_worker container..."
docker stop altrix_celery_worker 2>/dev/null || true
docker rm altrix_celery_worker 2>/dev/null || true
docker run -d \
    --name altrix_celery_worker \
    --restart always \
    --network host \
    -v /opt/altrix/shared/config/production.env:/app/.env:ro \
    "altrix-backend:${SHORT_SHA}" \
    celery -A app.celery_app.celery_app worker --loglevel=info -Q default,emails,pdfs,ai

echo "[INFO] Deploying altrix_celery_beat container..."
docker stop altrix_celery_beat 2>/dev/null || true
docker rm altrix_celery_beat 2>/dev/null || true
docker run -d \
    --name altrix_celery_beat \
    --restart always \
    --network host \
    -v /opt/altrix/shared/config/production.env:/app/.env:ro \
    "altrix-backend:${SHORT_SHA}" \
    celery -A app.celery_app.celery_app beat --loglevel=info

docker exec -u 0 altrix_backend apt-get update >/dev/null 2>&1 || true
docker exec -u 0 altrix_backend apt-get install -y curl >/dev/null 2>&1 || true

echo "[INFO] Waiting for backend container startup and health probe response..."
PROBE_FAIL=true

for i in {1..15}; do
    API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health || echo "000")
    if [ "${API_CODE}" = "200" ]; then
        echo "[INFO] FastAPI backend probe responded healthy (HTTP 200) on attempt ${i}."
        PROBE_FAIL=false
        break
    fi
    sleep 1
done

if [ "${PROBE_FAIL}" = "true" ]; then
    echo "[ERROR] FastAPI health probe failed after 15 attempts!"
fi

API_VER_JSON=$(curl -s http://127.0.0.1:8000/api/version || echo "{}")
echo "[INFO] Live API Version Response: ${API_VER_JSON}"

if echo "${API_VER_JSON}" | grep -q '"status":\s*"healthy"'; then
    echo "[INFO] Live API version status verified."
else
    echo "[ERROR] Live API version response status unhealthy!"
    PROBE_FAIL=true
fi

# 7. Rollback Protection
if [ "${PROBE_FAIL}" = "true" ]; then
    echo "================================================="
    echo " [CRITICAL] HEALTH PROBES FAILED! INITIATING ROLLBACK..."
    echo "================================================="
    if [ -n "${PREV_IMAGE}" ]; then
        echo "[ROLLBACK] Restoring previous container: ${PREV_IMAGE}..."
        docker stop altrix_backend 2>/dev/null || true
        docker rm altrix_backend 2>/dev/null || true
        docker run -d \
            --name altrix_backend \
            --restart always \
            --network host \
            -v /opt/altrix/shared/config/production.env:/app/.env:ro \
            "${PREV_IMAGE}"
    fi
    rm -rf "${RELEASE_DIR}"
    echo "[ROLLBACK COMPLETE] Production safely preserved on previous release."
    exit 1
fi

# 8. Atomic Activation
echo "[INFO] Probes passed! Activating release ${RELEASE_NAME}..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_SYMLINK}"
sudo systemctl reload nginx

# 9. Cleanup Obsolete Releases
echo "[INFO] Pruning obsolete releases & container images..."
ls -dt /opt/altrix/releases/release-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
docker image prune -f >/dev/null 2>&1 || true

# 9b. Export deployment and container logs to web-accessible location for diagnostics
echo "[INFO] Exporting diagnostics logs to shared assets..."
cp "${LOG_FILE}" /opt/altrix/shared/frontend/assets/deploy.txt 2>/dev/null || true
docker logs altrix_backend > /opt/altrix/shared/frontend/assets/docker.txt 2>&1 || true
chmod 644 /opt/altrix/shared/frontend/assets/deploy.txt /opt/altrix/shared/frontend/assets/docker.txt 2>/dev/null || true

echo "================================================="
echo " AUTOMATED DEPLOYMENT SUCCESSFUL!"
echo " Target Commit: ${TARGET_SHA}"
echo " Active Symlink: $(readlink -f ${CURRENT_SYMLINK})"
echo " Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "================================================="
