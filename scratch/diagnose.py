import subprocess
import socket
import os
import sys

def check_port(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        s.connect(('127.0.0.1', port))
        s.close()
        return True
    except Exception:
        return False

def run_diagnostics():
    print("=== AltRix Diagnostics ===")
    print(f"Python version: {sys.version}")
    print(f"Current working dir: {os.getcwd()}")
    
    # Check ports
    for port in [8000, 8080]:
        in_use = check_port(port)
        print(f"Port {port} is {'IN USE' if in_use else 'FREE'}")

    # Check node/npm version
    try:
        node_v = subprocess.check_output("node -v", shell=True, text=True).strip()
        print(f"Node version: {node_v}")
    except Exception as e:
        print(f"Error checking Node: {e}")

    try:
        npm_v = subprocess.check_output("npm -v", shell=True, text=True).strip()
        print(f"NPM version: {npm_v}")
    except Exception as e:
        print(f"Error checking NPM: {e}")

    # Check python packages in backend
    print("\nChecking backend imports...")
    try:
        import fastapi
        print("FastAPI is installed")
    except ImportError as e:
        print(f"FastAPI missing: {e}")

    try:
        import uvicorn
        print("Uvicorn is installed")
    except ImportError as e:
        print(f"Uvicorn missing: {e}")

if __name__ == "__main__":
    run_diagnostics()
