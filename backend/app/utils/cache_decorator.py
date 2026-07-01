import functools
import hashlib
import logging
from typing import Callable, Optional
from fastapi import Request, Response
from app.cache import cache

logger = logging.getLogger("app.cache_decorator")

def cache_response(ttl: int = 300, key_prefix: str = "api_resp"):
    """
    FastAPI response caching decorator.
    Generates a tenant-isolated cache key based on route path, query params, X-School-Id, and user session.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = None
            current_user = None
            school_id = None
            
            # 1. Extract request object from kwargs or args
            for arg in kwargs.values():
                if isinstance(arg, Request):
                    request = arg
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg

            # 2. Extract current user
            if "current_user" in kwargs:
                current_user = kwargs["current_user"]
            else:
                # Look in args if not in kwargs
                for arg in args:
                    if hasattr(arg, "id") and hasattr(arg, "roles") and hasattr(arg, "school_id"):
                        current_user = arg

            # 3. Resolve school_id context
            if current_user and getattr(current_user, "school_id", None):
                school_id = current_user.school_id
            
            if not school_id and request:
                school_id = request.headers.get("x-school-id")

            sid = school_id or "global"
            
            # 4. Generate unique parameter hash
            url_part = request.url.path if request else func.__name__
            query_part = str(request.query_params) if request else ""
            
            user_id = current_user.id if current_user and getattr(current_user, "id", None) else "anon"
            role = "_".join(sorted(current_user.roles)) if current_user and getattr(current_user, "roles", None) else "anon_role"
            
            param_str = f"path:{url_part}|query:{query_part}"
            param_hash = hashlib.md5(param_str.encode("utf-8")).hexdigest()
            
            # 5. Build tenant-isolated key
            cache_key = cache.build_key(
                school_id=sid,
                base_key=f"{key_prefix}:{param_hash}",
                user_id=user_id,
                role=role
            )
            
            # 6. Retrieve from Redis Cache
            try:
                cached_val = await cache.get(cache_key)
                if cached_val is not None:
                    return cached_val
            except Exception as e:
                logger.warning(f"Error checking cache inside decorator: {e}")

            # 7. Fallback to route execution
            response = await func(*args, **kwargs)
            
            # 8. Cache response payload if it is serializable and not a direct Response class
            if response is not None and not isinstance(response, Response):
                try:
                    await cache.set(cache_key, response, ttl)
                except Exception as e:
                    logger.warning(f"Error storing cache inside decorator: {e}")
                    
            return response

        return wrapper
    return decorator
