FROM python:3.10-slim

WORKDIR /app/backend

# System dependencies.
#
# postgresql-client supplies pg_dump and pg_restore. Without it the backup task
# fails with FileNotFoundError on every run — which is what was happening: the
# image carried only libpq-dev, so no backup could ever have been produced even
# after the task itself was fixed.
#
# Taken from PGDG rather than Debian's own repo because pg_dump refuses to dump a
# server newer than itself, and bookworm ships client 15 while the database may
# be 16 or later.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies from backend directory
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code cleanly into /app/backend
COPY backend/ ./

# Fail the build rather than ship a broken image: if pg_dump is absent the backup
# subsystem is silently dead, which is how it stayed unnoticed before.
RUN pg_dump --version && pg_restore --version

# Run as an unprivileged user.
#
# This container previously ran as root AND had /var/run/docker.sock mounted in,
# so any code execution inside it meant control of the Docker daemon — which is
# root on the host. The socket mount is gone (nothing in the app ever used it)
# and the process no longer starts with privileges it does not need.
#
# The UID is fixed at 10001 because /var/lib/altrix/storage is bind-mounted from
# the host and has to be owned by the same id; scripts/deploy.sh chowns it to
# match. Creating the directory here also means the path exists if a mount is
# ever missed, so pg_dump output has somewhere to land.
RUN groupadd --gid 10001 altrix \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin altrix \
    && mkdir -p /var/lib/altrix/storage \
    && chown -R 10001:10001 /var/lib/altrix/storage /app

# Set PYTHONPATH explicitly to /app/backend
ENV PYTHONPATH=/app/backend
ENV PORT=8000

USER 10001:10001

# Start the FastAPI server
CMD ["python", "start.py"]
