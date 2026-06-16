#!/bin/sh
# ==============================================================================
# AltRix School ERP — Container Entrypoint
# ==============================================================================
set -e

echo "AltRix Production Entrypoint starting..."

# Apply database migrations only on the web/API process.
# Celery workers and Beat processes will skip this step to avoid race conditions.
if [ "$1" = "gunicorn" ] || [ "$1" = "uvicorn" ] || [ "$1" = "python" ] || [ "$1" = "run.py" ] || [ "$1" = "sh" ]; then
    echo "Web process detected. Running database migrations..."
    python -m app.scripts.run_migrations
else
    echo "Non-web process detected ($1). Skipping migrations..."
fi

echo "Handing over execution to: $@"
exec "$@"
