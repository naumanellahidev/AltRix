"""
Custom middleware for the AltRix API: CORS, request logging, and execution timing.
"""
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.middleware")

class LoggingMiddleware(BaseHTTPMiddleware):
    """Logs details about incoming requests and their processing time."""
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        path = request.url.path
        method = request.method
        
        # Log request start
        logger.info(f"Started {method} '{path}'")
        
        try:
            response = await call_next(request)
            process_time = (time.time() - start_time) * 1000
            response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
            logger.info(
                f"Finished {method} '{path}' - Status {response.status_code} in {process_time:.2f}ms"
            )
            return response
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(
                f"Failed {method} '{path}' in {process_time:.2f}ms - Exception: {e}",
                exc_info=True
            )
            raise
