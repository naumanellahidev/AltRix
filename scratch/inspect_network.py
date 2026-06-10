import subprocess

def inspect_network():
    try:
        # Run netstat -ano to find listening ports
        print("Running netstat -ano...")
        output = subprocess.check_output("netstat -ano", shell=True, text=True)
        lines = output.strip().split("\n")
        
        listening_lines = []
        for line in lines:
            if "LISTENING" in line:
                listening_lines.append(line)
        
        print(f"Total LISTENING connections found: {len(listening_lines)}")
        
        # Filter for 8080 or 8000 or 9080 or 5173
        target_ports = ["8000", "8080", "8081", "8082", "5173", "9080", "3000"]
        found = False
        for line in listening_lines:
            for port in target_ports:
                if f":{port} " in line or f":{port}\t" in line or line.split()[1].endswith(f":{port}"):
                    print(f"MATCH: {line}")
                    found = True
                    break
        
        if not found:
            print("No active listener found for targets: 8000, 8080, 8081, 8082, 5173, 9080, 3000")
            print("Showing first 20 listening ports:")
            for line in listening_lines[:20]:
                print(line)
                
    except Exception as e:
        print(f"Error inspecting network: {e}")

if __name__ == "__main__":
    inspect_network()
