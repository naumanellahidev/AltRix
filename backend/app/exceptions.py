"""Custom HTTP exceptions for the AltRix API."""
from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    def __init__(self, resource: str, id: str = ""):
        detail = f"{resource} not found"
        if id:
            detail = f"{resource} '{id}' not found"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class ConflictError(HTTPException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class UnprocessableError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail
        )


class BadRequestError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class UnauthorizedError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class RateLimitError(HTTPException):
    def __init__(self, detail: str = "Too many requests. Please try again later.", retry_after: int = 60):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


class ServiceUnavailableError(HTTPException):
    def __init__(self, detail: str = "Service temporarily unavailable"):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )


class CampusIsolationError(HTTPException):
    def __init__(self, detail: str = "Access denied: resource belongs to a different campus"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class OwnershipError(HTTPException):
    def __init__(self, detail: str = "Access denied: you don't own this resource"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class SchoolIsolationError(HTTPException):
    def __init__(self, detail: str = "Access denied: resource belongs to a different school"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
