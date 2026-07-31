"""
Railway startup script — reads PORT from environment directly.
Eliminates all shell variable expansion issues.
"""
import os
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
