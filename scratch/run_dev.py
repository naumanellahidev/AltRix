import subprocess
import time
import os

log_file_path = "scratch/dev_server.log"
if os.path.exists(log_file_path):
    os.remove(log_file_path)

print("Starting dev server...")
with open(log_file_path, "w", encoding="utf-8") as f:
    process = subprocess.Popen(
        ["npm", "run", "dev"],
        stdout=f,
        stderr=subprocess.STDOUT,
        shell=True,
        cwd="d:\\Altrix Duplicate"
    )

# Let it run for 5 seconds to capture initial output
time.sleep(5)

# Read whatever has been written to the log file
if os.path.exists(log_file_path):
    with open(log_file_path, "r", encoding="utf-8") as f:
        print("--- Dev Server Output ---")
        print(f.read())
        print("-------------------------")
else:
    print("Log file not created!")
