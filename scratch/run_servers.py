import subprocess
import os
import sys
import time

def main():
    root_dir = r"d:\Altrix Duplicate"
    backend_dir = os.path.join(root_dir, "backend")

    # Windows creation flags: CREATE_NEW_CONSOLE = 0x00000010
    CREATE_NEW_CONSOLE = 0x00000010

    print("Launching Backend Server (FastAPI) in a new console...")
    backend_proc = subprocess.Popen(
        [sys.executable, "run.py"],
        cwd=backend_dir,
        creationflags=CREATE_NEW_CONSOLE,
        shell=True
    )
    print(f"Backend launch command sent. PID: {backend_proc.pid}")

    print("Launching Frontend Server (Vite) in a new console...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=root_dir,
        creationflags=CREATE_NEW_CONSOLE,
        shell=True
    )
    print(f"Frontend launch command sent. PID: {frontend_proc.pid}")

    # Let them initialize
    time.sleep(3)
    print("Both servers have been launched in separate console windows and are running in the background.")

if __name__ == "__main__":
    main()
