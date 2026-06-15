# AltRix Backend Production Deployment Guide

This guide provides step-by-step instructions to deploy the AltRix FastAPI backend on **Railway** (linked with **Supabase** and **Vercel**), as well as details on how to deploy it on a self-hosted **VPS** in the future.

---

## Part 1: Deployment on Railway

### 1. Repository Setup
1. Push your code repository (containing the `backend` directory) to GitHub.
2. Ensure that `backend/Dockerfile` and `backend/entrypoint.sh` are in the backend root directory of your repo.

### 2. Railway Project Provisioning
1. Sign in to [Railway.app](https://railway.app).
2. Create a **New Project**.
3. Provision a **Redis** service from Railway's database offerings (this will act as the Cache and Celery Message Broker).
4. Select **Deploy from GitHub repo**, select your repo, and configure the path to the backend directory:
   - Go to service **Settings** -> **General** -> **Root Directory** and set it to `/backend` (or leave as `/` if it is a mono-repo and you've configured your build settings accordingly).
   - In **Build** settings, make sure Railway is set to build using the **Dockerfile** (it will auto-detect the Dockerfile in the root folder).

### 3. Service Configurations
To run the full backend stack (FastAPI web server, Celery worker, and Celery beat), create **three services** in Railway from the same GitHub repository:

#### Service A: Web Server (FastAPI API)
- **Service Name**: `altrix-api`
- **Build Settings**: Root Directory = `/backend` (Railway auto-detects `Dockerfile`)
- **Start Command (Optional/Default)**: 
  `gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8000} --access-logfile - --error-logfile - app.main:app`
- **Networking**: In Settings, expose port `8000` (Railway automatically maps the `PORT` env variable). Generate a public domain.
- **Health Check Path**: `/health` (Interval: 10s, Timeout: 5s, Threshold: 2)

#### Service B: Celery Worker
- **Service Name**: `altrix-worker`
- **Start Command (Custom Override)**: 
  `celery -A app.celery_app.celery_app worker --loglevel=info -Q default,emails,pdfs,ai`
- **Networking**: Disable public networking (not needed for the worker).

#### Service C: Celery Periodic Task Scheduler (Beat)
- **Service Name**: `altrix-beat`
- **Start Command (Custom Override)**: 
  `celery -A app.celery_app.celery_app beat --loglevel=info`
- **Networking**: Disable public networking (not needed for beat).

---

### 4. Required Environment Variables
Configure these variables in **Variables** -> **Shared Variables** (or copy to all three services):

| Environment Variable | Description / Recommended Value |
| :--- | :--- |
| `APP_ENV` | Set to `production`. |
| `APP_NAME` | `"AltRix School ERP API"` |
| `SECRET_KEY` | Generate a secure key: `openssl rand -hex 32` |
| `DATABASE_URL` | Your Supabase connection string. **Use the connection pooler URL (port 5432)**. e.g., `postgresql://postgres.yourproject:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `DB_POOL_TYPE` | `queue` |
| `DB_POOL_SIZE` | `15` |
| `DB_POOL_MAX_OVERFLOW` | `25` |
| `REDIS_URL` | Reference your Railway Redis instance: `redis://${{Redis.REDISUSER}}:${{Redis.REDISPASSWORD}}@${{Redis.REDISHOST}}:${{Redis.REDISPORT}}/0` |
| `SUPABASE_URL` | e.g. `https://yourprojectid.supabase.co` |
| `SUPABASE_JWT_SECRET` | JWT Secret from Supabase Settings -> API (for validating auth tokens). |
| `SUPABASE_ANON_KEY` | Public anon key from Supabase Settings -> API. |
| `SUPABASE_SERVICE_ROLE_KEY`| Service role key (admin bypass) for advanced background actions. |
| `ALLOWED_ORIGINS` | Comma-separated list containing Vercel frontend domain and local host for debugging: `https://your-app.vercel.app,http://localhost:3000` |
| `GEMINI_API_KEY` | Your Google Gemini AI API key. |

---

## Part 2: Future Self-Hosted VPS Deployment

To transition AltRix to your own VPS in the future, choose one of the options below.

### Option A: Docker Compose Deployment (Recommended)
This is the easiest and most robust method. It keeps your VPS environment clean and mirrors the Railway setup.

1. **Install Docker & Docker Compose** on your VPS:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose
   ```
2. Create a `docker-compose.yml` file in your project root:
   ```yaml
   version: '3.8'

   services:
     api:
       build:
         context: ./backend
         dockerfile: Dockerfile
       ports:
         - "8000:8000"
       environment:
         - APP_ENV=production
         - DATABASE_URL=postgresql://postgres.yourproject:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
         - REDIS_URL=redis://redis:6379/0
         - SUPABASE_URL=https://yourprojectid.supabase.co
         - SUPABASE_JWT_SECRET=your_jwt_secret
         - SUPABASE_ANON_KEY=your_anon_key
         - ALLOWED_ORIGINS=https://your-frontend.vercel.app
         - SECRET_KEY=your_secret_key
       depends_on:
         - redis

     worker:
       build:
         context: ./backend
         dockerfile: Dockerfile
       command: celery -A app.celery_app.celery_app worker --loglevel=info -Q default,emails,pdfs,ai
       environment:
         - APP_ENV=production
         - DATABASE_URL=postgresql://postgres.yourproject:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
         - REDIS_URL=redis://redis:6379/0
         - SUPABASE_URL=https://yourprojectid.supabase.co
         - SUPABASE_JWT_SECRET=your_jwt_secret
         - SUPABASE_ANON_KEY=your_anon_key
         - SECRET_KEY=your_secret_key
       depends_on:
         - redis

     beat:
       build:
         context: ./backend
         dockerfile: Dockerfile
       command: celery -A app.celery_app.celery_app beat --loglevel=info
       environment:
         - APP_ENV=production
         - DATABASE_URL=postgresql://postgres.yourproject:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
         - REDIS_URL=redis://redis:6379/0
         - SUPABASE_URL=https://yourprojectid.supabase.co
         - SUPABASE_JWT_SECRET=your_jwt_secret
         - SUPABASE_ANON_KEY=your_anon_key
         - SECRET_KEY=your_secret_key
       depends_on:
         - redis

     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data

   volumes:
     redis_data:
   ```
3. Run `docker-compose up -d` to start the entire cluster. Our `entrypoint.sh` will automatically migrate your database tables on startup before launching the web server.

---

### Option B: Raw Python + Systemd Service Deployment
If you prefer to run services directly on the host OS:

1. **Install System Dependencies**:
   ```bash
   sudo apt update
   sudo apt install -y python3-pip python3-venv redis-server
   ```
2. **Setup Codebase & Virtual Environment**:
   ```bash
   cd /var/www/altrix-backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. **Configure systemd Services**:
   Create a Systemd file for the API: `/etc/systemd/system/altrix-api.service`
   ```ini
   [Unit]
   Description=AltRix FastAPI Backend Service
   After=network.target redis-server.service

   [Service]
   User=www-data
   WorkingDirectory=/var/www/altrix-backend
   EnvironmentFile=/var/www/altrix-backend/.env
   ExecStartPre=/var/www/altrix-backend/.venv/bin/python -m app.scripts.run_migrations
   ExecStart=/var/www/altrix-backend/.venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 app.main:app
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   Create a Systemd file for the Celery Worker: `/etc/systemd/system/altrix-worker.service`
   ```ini
   [Unit]
   Description=AltRix Celery Worker Service
   After=network.target redis-server.service

   [Service]
   User=www-data
   WorkingDirectory=/var/www/altrix-backend
   EnvironmentFile=/var/www/altrix-backend/.env
   ExecStart=/var/www/altrix-backend/.venv/bin/celery -A app.celery_app.celery_app worker --loglevel=info -Q default,emails,pdfs,ai
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
4. **Enable & Start Services**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable altrix-api altrix-worker
   sudo systemctl start altrix-api altrix-worker
   ```
