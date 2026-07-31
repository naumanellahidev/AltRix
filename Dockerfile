FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for psycopg2 and other native packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies from backend directory
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Default port (Railway injects PORT env var)
ENV PORT=8000

# Start the FastAPI server
CMD ["sh", "-c", "cd backend && python start.py"]
