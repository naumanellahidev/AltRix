#!/usr/bin/env python3
import subprocess

conf_path = "/etc/postgresql/17/main/postgresql.conf"
hba_path = "/etc/postgresql/17/main/pg_hba.conf"

with open(conf_path) as f:
    conf = f.read()

if "172.20.0.1" not in conf:
    conf = conf.replace("listen_addresses = '127.0.0.1,172.19.0.1,172.17.0.1'", "listen_addresses = '127.0.0.1,172.17.0.1,172.19.0.1,172.20.0.1'")
    with open(conf_path, "w") as f:
        f.write(conf)

with open(hba_path) as f:
    hba = f.read()

if "172.20.0.0/16" not in hba:
    with open(hba_path, "a") as f:
        f.write("\nhost    all             all             172.20.0.0/16           scram-sha-256\n")

subprocess.run(["systemctl", "restart", "postgresql"], check=True)
print("PostgreSQL 17 restarted with full docker network listeners.")
