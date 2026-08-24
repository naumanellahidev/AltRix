from functools import wraps
from flask import request, g
from app.security.auth import validate_session
from app.utils.response import api_error

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif "cc_session" in request.cookies:
            token = request.cookies.get("cc_session")

        user = validate_session(token)
        if not user:
            return api_error("Authentication required: Invalid or expired session token", code="UNAUTHORIZED", status_code=401)

        g.current_user = user
        return f(*args, **kwargs)
    return decorated

def require_role(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, "current_user", None)
            if not user or user.get("role") not in allowed_roles:
                return api_error("Forbidden: Insufficient role privileges", code="FORBIDDEN", status_code=403)
            return f(*args, **kwargs)
        return decorated
    return decorator
