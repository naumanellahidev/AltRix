import socket
import urllib.request

def check_port(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        s.connect(('127.0.0.1', port))
        s.close()
        return True
    except Exception:
        return False

print(f"Port 8080 (Vite Frontend): {'OPEN' if check_port(8080) else 'CLOSED'}")
print(f"Port 8000 (FastAPI Backend): {'OPEN' if check_port(8000) else 'CLOSED'}")

if check_port(8080):
    try:
        with urllib.request.urlopen("http://localhost:8080/", timeout=1.0) as response:
            print(f"HTTP GET / from 8080 returned status: {response.status}")
    except Exception as e:
        print(f"HTTP GET / from 8080 failed: {e}")
