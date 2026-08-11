#!/usr/bin/env python3
import subprocess, os, json

def run_cmd(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip()

print("=== 1. SYSTEMD SERVICES & TIMERS ===")
print(run_cmd("systemctl list-units --type=service,timer --no-pager | grep -iE 'altrix|postgres|redis|nginx|docker'"))

print("\n=== 2. CRON JOBS ===")
print("System Crontab:")
print(run_cmd("cat /etc/crontab 2>/dev/null"))
print("\nCron.d files:")
print(run_cmd("ls -la /etc/cron.d/ 2>/dev/null"))
print("\nUser Crontab:")
print(run_cmd("crontab -l 2>/dev/null || echo 'No user crontab'"))

print("\n=== 3. DOCKER CONTAINERS ===")
print(run_cmd("docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'"))

print("\n=== 4. BACKEND BACKGROUND TASKS & CELERY ===")
print(run_cmd("ps aux | grep -iE 'celery|rq|apscheduler|cron|python' | grep -v grep"))
