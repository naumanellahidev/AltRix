# ==============================================================================
# AltRix School ERP — Production Dockerfile
# Multi-stage build to ensure small footprint and security.
# ==============================================================================

# --- Stage 1: Builder ---
FROM python:3.10-slim AS builder

WORKDIR /build

# Install compilation dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies into a virtual env
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --- Stage 2: Final Run Image ---
FROM python:3.10-slim AS runner

WORKDIR /app

# Install runtime dependencies (like libpq for postgres connection)
# postgresql-client-17 supplies pg_dump / pg_restore for the backup feature.
# From PGDG: Debian's own client is older than the server, and pg_dump refuses
# to dump a server newer than itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && pg_dump --version

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Copy application source code
COPY . .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# Expose port (FastAPI default)
EXPOSE 8000

# Set entrypoint script
ENTRYPOINT ["./entrypoint.sh"]

CMD ["sh", "-c", "gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8000} --timeout 300 --graceful-timeout 30 --keep-alive 65 --access-logfile - --error-logfile - app.main:app"]

