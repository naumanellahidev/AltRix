"""
Railway startup script — reads PORT from environment directly.
Eliminates all shell variable expansion issues.
"""
import os
import sys
from pathlib import Path

# Guarantee that the directory containing app/ is at the head of sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting AltRix API on port {port}...")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
