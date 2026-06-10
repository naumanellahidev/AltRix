import socket

def scan_ports():
    ports = [8000, 8080, 8081, 8082, 5173, 5174, 9080, 3000, 3001]
    for port in ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        try:
            s.connect(('127.0.0.1', port))
            print(f"Port {port} is OPEN")
            s.close()
        except Exception:
            print(f"Port {port} is CLOSED")

if __name__ == "__main__":
    scan_ports()
