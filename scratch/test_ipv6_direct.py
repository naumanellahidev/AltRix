import socket
import sys

ipv6_addr = "2a05:d018:10e0:3300:7152:91d8:4b3e:f546"
port = 5432

print(f"Testing direct TCP connection to IPv6 address [{ipv6_addr}]:{port}...", flush=True)

try:
    # Create an IPv6 socket
    s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect((ipv6_addr, port))
    print("SUCCESS: Connected to the database over IPv6 directly!", flush=True)
    s.close()
except Exception as e:
    print(f"FAILED: Connection failed: {e}", flush=True)
