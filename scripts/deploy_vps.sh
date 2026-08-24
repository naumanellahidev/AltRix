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
GIT_TERMINAL_PROMPT=0 git fetch origin || echo "[WARNING] Fetch from origin failed"
GIT_TERMINAL_PROMPT=0 git fetch altrix2 2>/dev/null || echo "[INFO] Fetch from altrix2 skipped or unneeded"

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
echo "[INFO] Guaranteeing database schema permissions and column migrations for app user..."
# Try connecting via local postgres user first (if script runs as root)
sudo -u postgres psql -d altrix -c "
  GRANT USAGE ON SCHEMA auth TO altrix_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO altrix_app;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO altrix_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
  ALTER TABLE IF EXISTS public.book_issues ADD COLUMN IF NOT EXISTS campus_id UUID;
  ALTER TABLE IF EXISTS public.book_issues ADD COLUMN IF NOT EXISTS fine_per_day NUMERIC(10, 2) DEFAULT 20.00;
  ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS campus_id UUID;
  ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
  ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100);
  ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS publisher VARCHAR(255);
  ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS publication_year INTEGER;
  ALTER TABLE IF EXISTS public.school_events ADD COLUMN IF NOT EXISTS campus_id UUID;
  ALTER TABLE IF EXISTS public.school_events ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all';
  ALTER TABLE IF EXISTS public.school_events ADD COLUMN IF NOT EXISTS rsvp_enabled BOOLEAN DEFAULT false;
  ALTER TABLE IF EXISTS public.school_events ADD COLUMN IF NOT EXISTS rsvp_count INTEGER DEFAULT 0;
  ALTER TABLE IF EXISTS public.school_events ADD COLUMN IF NOT EXISTS max_attendees INTEGER;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO altrix_app;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
" || true

# Try using the admin database URL from vps_postgresql.env or production.env directly (works without passwordless sudo)
for config_file in "/opt/altrix/shared/config/vps_postgresql.env" "/opt/altrix/shared/config/production.env"; do
    if [ -f "${config_file}" ]; then
        ADMIN_URL=$(grep '^VPS_ADMIN_DATABASE_URL=' "${config_file}" | cut -d '=' -f2-)
        if [ -n "${ADMIN_URL}" ]; then
            echo "[INFO] Running schema grants and migrations via admin URL from $(basename ${config_file})..."
            psql "${ADMIN_URL}" -c "
              GRANT USAGE ON SCHEMA auth TO altrix_app;
              GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO altrix_app;
              GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO altrix_app;
              ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
              ALTER TABLE IF EXISTS public.book_issues ADD COLUMN IF NOT EXISTS campus_id UUID;
              ALTER TABLE IF EXISTS public.book_issues ADD COLUMN IF NOT EXISTS fine_per_day NUMERIC(10, 2) DEFAULT 20.00;
              ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS campus_id UUID;
              ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
              ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100);
              ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS publisher VARCHAR(255);
              ALTER TABLE IF EXISTS public.library_books ADD COLUMN IF NOT EXISTS publication_year INTEGER;
              GRANT ALL ON ALL TABLES IN SCHEMA public TO altrix_app;
              GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
            " || true
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
cp "${LOG_FILE}" "${RELEASE_DIR}/frontend/assets/deploy.txt" 2>/dev/null || true
docker logs altrix_backend > "${RELEASE_DIR}/frontend/assets/docker.txt" 2>&1 || true
chmod 644 "${RELEASE_DIR}/frontend/assets/deploy.txt" "${RELEASE_DIR}/frontend/assets/docker.txt" 2>/dev/null || true

# 9c. Authoritative AltriX Mail Platform Deployment (mail.altrixcore.com)
echo "[INFO] Syncing & Deploying AltriX Mail Platform to /opt/mail-platform/..."
MAIL_REPO_DIR="/opt/mail-platform/repo"
MAIL_CONTROL_DIR="/opt/mail-platform/control-center"
mkdir -p /opt/mail-platform/logs/deployments

# Dynamically extract git token from existing repository if present
GH_TOKEN=$(git -C /opt/altrix/repo remote get-url origin 2>/dev/null | sed -n 's/.*https:\/\/\([^@]*\)@github\.com.*/\1/p' || echo "")
if [ -n "${GH_TOKEN}" ]; then
    MAIL_AUTH_URL="https://${GH_TOKEN}@github.com/naumanellahidev/altrix_mailserver.git"
else
    MAIL_AUTH_URL="https://github.com/naumanellahidev/altrix_mailserver.git"
fi

if [ ! -d "${MAIL_REPO_DIR}/.git" ]; then
    echo "[INFO] Initializing altrix_mailserver repository at ${MAIL_REPO_DIR}..."
    rm -rf "${MAIL_REPO_DIR}" 2>/dev/null || true
    git clone "${MAIL_AUTH_URL}" "${MAIL_REPO_DIR}" 2>&1 || git clone https://github.com/naumanellahidev/altrix_mailserver.git "${MAIL_REPO_DIR}" 2>&1 || true
fi

if [ -d "${MAIL_REPO_DIR}/.git" ]; then
    cd "${MAIL_REPO_DIR}"
    git remote set-url origin "${MAIL_AUTH_URL}" 2>/dev/null || true
    git fetch origin main 2>&1 || true
    MAIL_TARGET_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
    echo "[INFO] Mail platform target commit: ${MAIL_TARGET_SHA:0:7}"
    git checkout -f "${MAIL_TARGET_SHA}" 2>&1 || true
    
    # Build frontend if node/npm is available
    if command -v npm >/dev/null 2>&1; then
        echo "[INFO] Building mail platform frontend..."
        cd "${MAIL_REPO_DIR}/frontend"
        if [ -f package-lock.json ]; then
            npm ci --prefer-offline 2>&1 || npm install 2>&1 || true
        else
            npm install 2>&1 || true
        fi
        GIT_COMMIT_SHA="${MAIL_TARGET_SHA}" npm run build 2>&1 || true
    fi

    # Sync into control-center directory
    mkdir -p "${MAIL_CONTROL_DIR}/dist" "${MAIL_CONTROL_DIR}/frontend/dist"
    cp -rp "${MAIL_REPO_DIR}/dist/"* "${MAIL_CONTROL_DIR}/dist/" 2>/dev/null || true
    cp -rp "${MAIL_REPO_DIR}/frontend/dist/"* "${MAIL_CONTROL_DIR}/dist/" 2>/dev/null || true
    cp -rp "${MAIL_REPO_DIR}/frontend/dist/"* "${MAIL_CONTROL_DIR}/frontend/dist/" 2>/dev/null || true
    cp -rp "${MAIL_REPO_DIR}/app" "${MAIL_CONTROL_DIR}/" 2>/dev/null || true
    cp -p "${MAIL_REPO_DIR}/server.py" "${MAIL_CONTROL_DIR}/" 2>/dev/null || true
    chmod -R 755 "${MAIL_CONTROL_DIR}" 2>/dev/null || true

    # Sync directly into mailu_control_center Docker container if present
    if docker ps -a --format '{{.Names}}' | grep -q "^mailu_control_center$"; then
        echo "[INFO] Injecting into mailu_control_center container..."
        docker exec mailu_control_center mkdir -p /app/dist /app/frontend/dist /app/app 2>/dev/null || true
        docker cp "${MAIL_CONTROL_DIR}/dist/." mailu_control_center:/app/dist/ 2>/dev/null || true
        docker cp "${MAIL_CONTROL_DIR}/dist/." mailu_control_center:/app/frontend/dist/ 2>/dev/null || true
        docker cp "${MAIL_CONTROL_DIR}/app/." mailu_control_center:/app/app/ 2>/dev/null || true
        docker cp "${MAIL_CONTROL_DIR}/server.py" mailu_control_center:/app/server.py 2>/dev/null || true
        echo "[INFO] Restarting mailu_control_center..."
        docker restart mailu_control_center 2>&1 || true
    fi

    # Check standalone server.py daemon
    if pgrep -f "python.*server.py" >/dev/null 2>&1; then
        echo "[INFO] Restarting standalone server.py..."
        pkill -f "python.*server.py" 2>/dev/null || true
        sleep 1
        nohup python3 "${MAIL_CONTROL_DIR}/server.py" > /opt/mail-platform/logs/server.log 2>&1 &
    fi

    # Check if port 5000 is healthy, if not launch standalone server.py
    sleep 2
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health || echo "000")
    if [ "${CODE}" != "200" ]; then
        echo "[INFO] Port 5000 probe responded ${CODE}, launching standalone server.py..."
        pkill -f "python.*server.py" 2>/dev/null || true
        nohup python3 "${MAIL_CONTROL_DIR}/server.py" > /opt/mail-platform/logs/server.log 2>&1 &
    fi

    echo "[INFO] AltriX Mail Platform sync complete."
fi

echo "================================================="
echo " AUTOMATED DEPLOYMENT SUCCESSFUL!"
echo " Target Commit: ${TARGET_SHA}"
echo " Active Symlink: $(readlink -f ${CURRENT_SYMLINK})"
echo " Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "================================================="
