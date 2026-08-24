import subprocess
import os

class MailuCli:
    @staticmethod
    def generate_dkim(domain: str):
        try:
            res = subprocess.run(
                ["docker", "exec", "mailu_admin", "flask", "mailu", "dkim-generate", domain],
                capture_output=True, text=True, timeout=15
            )
            return res.returncode == 0, res.stdout, res.stderr
        except Exception as e:
            return False, "", str(e)

    @staticmethod
    def get_queue_raw():
        try:
            res = subprocess.run(
                ["docker", "exec", "mailu_smtp", "mailq"],
                capture_output=True, text=True, timeout=10
            )
            return res.stdout.strip()
        except Exception as e:
            return f"Queue unavailable: {e}"

    @staticmethod
    def flush_queue():
        try:
            res = subprocess.run(
                ["docker", "exec", "mailu_smtp", "postfix", "flush"],
                capture_output=True, text=True, timeout=10
            )
            return res.returncode == 0, res.stdout, res.stderr
        except Exception as e:
            return False, "", str(e)

    @staticmethod
    def inspect_container(container_name: str):
        try:
            res = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Status}}", container_name],
                capture_output=True, text=True, timeout=5
            )
            return res.stdout.strip()
        except Exception:
            return "unknown"

mailu_cli = MailuCli()
