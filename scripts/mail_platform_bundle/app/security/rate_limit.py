import time
from collections import defaultdict
from flask import request
from app.utils.response import api_error

class SlidingWindowLimiter:
    def __init__(self):
        self.requests = defaultdict(list)

    def is_allowed(self, key, max_requests, window_seconds):
        now = time.time()
        window_start = now - window_seconds
        # Evict old timestamps
        self.requests[key] = [ts for ts in self.requests[key] if ts > window_start]
        
        if len(self.requests[key]) >= max_requests:
            return False
        
        self.requests[key].append(now)
        return True

limiter = SlidingWindowLimiter()

def rate_limit(max_requests=60, window_seconds=60):
    def decorator(f):
        def wrapper(*args, **kwargs):
            ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"
            endpoint_key = f"{ip}:{request.endpoint}"
            
            if not limiter.is_allowed(endpoint_key, max_requests, window_seconds):
                return api_error(
                    f"Rate limit exceeded. Maximum {max_requests} requests per {window_seconds}s.",
                    code="RATE_LIMIT_EXCEEDED",
                    status_code=429
                )
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator
