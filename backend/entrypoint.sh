#!/bin/bash
if [ $# -gt 0 ]; then
  exec "$@"
else
  exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
fi
