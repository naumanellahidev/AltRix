import subprocess
import time
import os
import sys

log_file_path = r"d:\Altrix Duplicate\scratch\dev_server.log"
if os.path.exists(log_file_path):
    try:
        os.remove(log_file_path)
    except Exception as e:
        print(f"Could not remove existing log file: {e}")

print("Starting dev server subprocess...")
f = open(log_file_path, "w", encoding="utf-8")
try:
    process = subprocess.Popen(
        ["npm", "run", "dev"],
        stdout=f,
        stderr=subprocess.STDOUT,
        shell=True,
        cwd=r"d:\Altrix Duplicate"
    )
    
    print("Subprocess spawned. Waiting 10 seconds to collect output...")
    time.sleep(10)
    
    print("Terminating subprocess...")
    process.terminate()
    try:
        process.wait(timeout=3)
        print("Subprocess terminated cleanly.")
    except subprocess.TimeoutExpired:
        print("Subprocess did not terminate, killing it...")
        process.kill()
        process.wait()
finally:
    f.close()

# Print the log output
if os.path.exists(log_file_path):
    print("--- Log Content ---")
    with open(log_file_path, "r", encoding="utf-8") as lf:
        print(lf.read())
    print("-------------------")
else:
    print("Log file does not exist!")
