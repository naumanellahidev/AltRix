import subprocess
import os
import time

def main():
    root_dir = r"d:\Altrix Duplicate"
    backend_dir = os.path.join(root_dir, "backend")
    venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    log_file = os.path.join(root_dir, "scratch", "backend_debug.log")

    if os.path.exists(log_file):
        os.remove(log_file)

    print(f"Using python: {venv_python}")
    print(f"Writing output to: {log_file}")

    with open(log_file, "w", encoding="utf-8") as f:
        f.write("=== Backend Server Debug Log ===\n")
        f.flush()
        
        proc = subprocess.Popen(
            [venv_python, "run.py"],
            cwd=backend_dir,
            stdout=f,
            stderr=subprocess.STDOUT,
            shell=True
        )
        
        print(f"Backend started with PID: {proc.pid}. Waiting 5 seconds...")
        time.sleep(5)
        
        # Check if process is still running
        ret = proc.poll()
        if ret is None:
            print("Backend is still running. Terminating process...")
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
            print("Backend process terminated.")
        else:
            print(f"Backend process exited with code: {ret}")

    # Read the log
    with open(log_file, "r", encoding="utf-8") as f:
        print("\n--- CAPTURED OUTPUT ---")
        print(f.read())
        print("-----------------------")

if __name__ == "__main__":
    main()
