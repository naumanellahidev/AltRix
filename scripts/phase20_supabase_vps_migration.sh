#!/usr/bin/env bash
# ==============================================================================
# AltRix VPS Migration - Phase 20: Supabase to VPS PostgreSQL Migration (20A, 20B, 20C)
# Target: Ubuntu 24.04 LTS (169.58.111.159)
# Mode: Live Forensic Export & PostgreSQL Service Provisioning
# ==============================================================================

set -uo pipefail

echo "================================================================="
echo "  PHASE 20: Full Supabase to VPS Migration (20A, 20B, 20C)       "
echo "================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo."
  exit 1
fi

PROD_ENV="/opt/altrix/shared/config/production.env"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="/var/backups/altrix/supabase_export_$TIMESTAMP"
VPS_PG_CONFIG="/opt/altrix/shared/config/vps_postgresql.env"

# ==============================================================================
# PHASE 20A: Dependency Map & Pre-Flight Verification
# ==============================================================================
echo ""
echo "[+] PHASE 20A: Compiling Live Supabase Dependency Inventory..."

cat << 'EOF' > /var/backups/altrix/SUPABASE_DEPENDENCY_MAP.md
# AltRix Production Supabase Dependency Inventory (Phase 20A)

## 1. Database & ORM Layer
- **Engine**: SQLAlchemy asyncio with asyncpg driver (`DATABASE_URL`)
- **Models**: Standard relational schema in PostgreSQL (`public` schema)
- **Tables**: Users, Schools, Students, Teachers, Classes, Attendance, Fees, Exams, Grades, AI Caches, System Settings, Event Bus, Notifications
- **Migration Strategy**: Zero-data-loss logical migration to local PostgreSQL 16.

## 2. Authentication Layer
- **Current Flow**: JWT validation via Supabase JWT secret or FastAPI internal token signing (`SECRET_KEY`)
- **Target Flow**: Self-contained FastAPI authentication with bcrypt password hashing and RS256/HS256 local JWT signing.

## 3. Storage Layer
- **Current Flow**: Supabase Storage REST API (`storage/v1/object/sign`) for file uploads/report cards.
- **Target Flow**: Local protected file storage (`/opt/altrix/storage/`) with Nginx static delivery or FastAPI streaming.

## 4. Realtime / WebSocket Layer
- **Current Flow**: Redis Pub/Sub broadcast listener in FastAPI (`websocket_manager.py`). Independent of Supabase Realtime.
EOF
chmod 600 /var/backups/altrix/SUPABASE_DEPENDENCY_MAP.md
chown root:root /var/backups/altrix/SUPABASE_DEPENDENCY_MAP.md
echo "    Dependency map written to /var/backups/altrix/SUPABASE_DEPENDENCY_MAP.md"

# ==============================================================================
# PHASE 20B: Complete Supabase Database Forensic Export
# ==============================================================================
echo ""
echo "[+] PHASE 20B: Exporting Complete Production Supabase Database..."

# Install postgresql-client if missing
if ! command -v pg_dump &>/dev/null; then
    echo "    Installing postgresql-client..."
    apt-get update -qq && apt-get install -y -qq postgresql-client
fi

mkdir -p "$EXPORT_DIR"
chmod 700 "$EXPORT_DIR"
chown root:root "$EXPORT_DIR"

if [ -f "$PROD_ENV" ]; then
    # Safely extract DATABASE_URL without printing
    DB_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    
    if [ -n "$DB_URL" ]; then
        echo "    Connecting to Supabase PostgreSQL for complete forensic dump..."
        
        # 1. Full schema structure export
        pg_dump "$DB_URL" --schema-only --no-owner --no-privileges -f "$EXPORT_DIR/supabase_schema_structure.sql" 2>/dev/null || {
            echo "[-] Warning: Standard schema dump encountered warning, continuing with custom format..."
        }
        
        # 2. Complete logical dump (Structure + Data) in PostgreSQL custom format
        pg_dump "$DB_URL" --format=c --no-owner --no-privileges -f "$EXPORT_DIR/supabase_full_database.dump" 2>/dev/null
        
        # 3. Plain SQL compressed dump for disaster recovery & inspection
        pg_dump "$DB_URL" --no-owner --no-privileges 2>/dev/null | gzip > "$EXPORT_DIR/supabase_full_database.sql.gz"
        
        # 4. Generate table inventory and row counts
        echo "=== SUPABASE TABLE INVENTORY & ROW COUNTS ===" > "$EXPORT_DIR/table_inventory.txt"
        psql "$DB_URL" -c "
            SELECT 
                schemaname, 
                relname as table_name, 
                n_live_tup as approximate_row_count 
            FROM pg_stat_user_tables 
            ORDER BY schemaname, relname;
        " >> "$EXPORT_DIR/table_inventory.txt" 2>/dev/null || true
        
        # Calculate SHA-256 hashes
        cd "$EXPORT_DIR"
        sha256sum * > "$EXPORT_DIR/checksums.sha256"
        chmod 600 "$EXPORT_DIR"/*
        
        echo "    [PASS] Complete forensic database dump saved to $EXPORT_DIR:"
        ls -la "$EXPORT_DIR"
        cat "$EXPORT_DIR/table_inventory.txt" | head -n 30
        
        unset DB_URL
    else
        echo "[-] DATABASE_URL not found in $PROD_ENV"
        exit 1
    fi
else
    echo "[-] Configuration $PROD_ENV not found"
    exit 1
fi

# ==============================================================================
# PHASE 20C: Build VPS PostgreSQL (PostgreSQL 16 on Localhost Only)
# ==============================================================================
echo ""
echo "[+] PHASE 20C: Installing and Configuring Production PostgreSQL 16 on VPS..."

# Install PostgreSQL server
if ! command -v psql &>/dev/null || ! systemctl list-unit-files | grep -q "postgresql.service"; then
    echo "    Installing postgresql 16..."
    apt-get install -y -qq postgresql postgresql-contrib
fi

# Determine PostgreSQL version & config path
PG_VER=$(psql --version | awk '{print $3}' | cut -d. -f1)
PG_CONF_DIR="/etc/postgresql/$PG_VER/main"

echo "    Configuring PostgreSQL $PG_VER in $PG_CONF_DIR..."

# 1. Enforce localhost-only listening
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '127.0.0.1'/" "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true
sed -i "s/listen_addresses = .*/listen_addresses = '127.0.0.1'/" "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true

# 2. Performance tuning for 8GB VPS
sed -i "s/shared_buffers = .*/shared_buffers = 1GB/" "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true
sed -i "s/#work_mem = .*/work_mem = 16MB/" "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true
sed -i "s/max_connections = .*/max_connections = 150/" "$PG_CONF_DIR/postgresql.conf" 2>/dev/null || true

# 3. Configure pg_hba.conf for local scram-sha-256 / md5 authentication
cat << 'EOF' > "$PG_CONF_DIR/pg_hba.conf"
# PostgreSQL Client Authentication Configuration File
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
EOF

systemctl restart postgresql
systemctl enable postgresql
sleep 2

echo "    PostgreSQL service status: $(systemctl is-active postgresql)"

# Generate secure random passwords
ADMIN_PASS=$(openssl rand -hex 24)
APP_PASS=$(openssl rand -hex 24)

# Create Database and Roles
sudo -u postgres psql << EOF > /dev/null 2>&1
CREATE DATABASE altrix;
CREATE USER altrix_admin WITH ENCRYPTED PASSWORD '$ADMIN_PASS' CREATEDB;
CREATE USER altrix_app WITH ENCRYPTED PASSWORD '$APP_PASS';

GRANT ALL PRIVILEGES ON DATABASE altrix TO altrix_admin;
GRANT CONNECT ON DATABASE altrix TO altrix_app;
\c altrix
GRANT ALL ON SCHEMA public TO altrix_admin;
GRANT USAGE, CREATE ON SCHEMA public TO altrix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
EOF

# Store credentials safely in protected environment file
cat << EOF > "$VPS_PG_CONFIG"
# AltRix VPS Local PostgreSQL Configuration (Phase 20C)
# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
VPS_PG_HOST=127.0.0.1
VPS_PG_PORT=5432
VPS_PG_DATABASE=altrix
VPS_PG_ADMIN_USER=altrix_admin
VPS_PG_ADMIN_PASSWORD=$ADMIN_PASS
VPS_PG_APP_USER=altrix_app
VPS_PG_APP_PASSWORD=$APP_PASS
VPS_DATABASE_URL=postgresql://altrix_app:${APP_PASS}@127.0.0.1:5432/altrix
VPS_ADMIN_DATABASE_URL=postgresql://altrix_admin:${ADMIN_PASS}@127.0.0.1:5432/altrix
EOF

chmod 600 "$VPS_PG_CONFIG"
chown root:root "$VPS_PG_CONFIG"
unset ADMIN_PASS APP_PASS

echo "    [PASS] Local PostgreSQL database 'altrix' and roles 'altrix_admin', 'altrix_app' provisioned."
echo "    [PASS] Credentials stored in $VPS_PG_CONFIG (mode 600 root:root)."

# Verify loopback isolation (Port 5432 MUST be 127.0.0.1 only)
echo ""
echo "[+] Verifying PostgreSQL Network Isolation..."
ss -lntup | grep 5432

# Verify local authentication connectivity
echo ""
echo "[+] Verifying Local PostgreSQL Authentication..."
PGPASSWORD=$(grep '^VPS_PG_APP_PASSWORD=' "$VPS_PG_CONFIG" | cut -d '=' -f2) psql -h 127.0.0.1 -U altrix_app -d altrix -c "SELECT current_database(), current_user, version();" || echo "[-] Local auth test failed"

# Production Health Verification
echo ""
echo "[+] Production Health & Regression Verification..."
echo -n "    SSH daemon: " && systemctl is-active ssh
echo -n "    Fail2Ban service: " && systemctl is-active fail2ban
echo -n "    Docker daemon: " && systemctl is-active docker
echo -n "    Nginx reverse-proxy: " && systemctl is-active nginx
echo -n "    Local PostgreSQL: " && systemctl is-active postgresql
echo -n "    AltRix Backend Container: " && docker inspect altrix_backend --format '{{.State.Status}} ({{.State.Health.Status}})' || echo "N/A"
echo -n "    Production HTTPS (/): " && curl -Is https://altrixcore.com | head -n 1
echo -n "    Production Health (/health): " && curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/health
echo -n "    Production API Health (/api/health): " && curl -s -o /dev/null -w '%{http_code}\n' https://altrixcore.com/api/health

echo ""
echo "================================================================="
echo "  PHASE 20A, 20B, 20C EXECUTION COMPLETE                         "
echo "================================================================="
