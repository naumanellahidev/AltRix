#!/bin/bash
set -e

PG_HBA=$(find /etc/postgresql/ -name "pg_hba.conf" | head -n 1)
echo "Updating $PG_HBA..."

if ! grep -q "hostnossl all all 169.58.111.159/32" "$PG_HBA"; then
    echo "hostnossl all all 127.0.0.1/32 scram-sha-256" >> "$PG_HBA"
    echo "hostnossl all all 172.0.0.0/8 scram-sha-256" >> "$PG_HBA"
    echo "hostnossl all all 169.58.111.159/32 scram-sha-256" >> "$PG_HBA"
    echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PG_HBA"
fi

systemctl reload postgresql
echo "PostgreSQL pg_hba.conf updated and reloaded!"
