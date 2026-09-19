"""
Pagination utilities for list endpoints.
Supports both offset-based and cursor-based pagination.
"""
import logging
from typing import Annotated, Generic, List, Optional, TypeVar

from fastapi import Depends, Query, Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number (1-based)")
    page_size: int = Field(default=20, ge=1, le=200, description="Items per page")
    search: Optional[str] = Field(default=None, description="Search query")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @classmethod
    def create(
        cls,
        data: List[T],
        total: int,
        page: int,
        page_size: int,
    ) -> "PaginatedResponse[T]":
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
        return cls(
            data=data,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )


# ─── A bound on every list endpoint ───────────────────────────────────────────
#
# Seventy-four list endpoints ran an unbounded SELECT: the whole table for the
# school, serialised into one JSON array. A school with ten years of attendance
# rows would have the worker build a response big enough to run the container
# out of memory, and the browser would then try to render it.
#
# Switching them to PaginatedResponse would change the response body from an
# array to an object and break every caller at once, so instead this adds a
# ceiling without changing the shape. Callers that send nothing keep getting a
# plain array; callers that want to page can.
#
# The ceiling is deliberately high. The point is to make the worst case
# survivable, not to truncate ordinary data — a class list of eighty rows must
# not come back short because of a limit meant to stop a runaway query.

DEFAULT_LIST_LIMIT = 2000
MAX_LIST_LIMIT = 5000


class ListPage:
    """
    Query-parameter bound for a list endpoint, as a FastAPI dependency.

    Used as ``page: ListPageParams`` on the endpoint and ``page.apply(stmt)``
    around the SELECT.

    A response carrying exactly ``limit`` rows may have more behind it. The
    ``X-Result-Limit`` and ``X-Result-Offset`` headers say what bound was
    applied, so a caller can tell a full page apart from the end of the data
    and ask for the next one.
    """

    def __init__(
        self,
        response: Response,
        limit: int = Query(
            DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT,
            description="Maximum rows to return.",
        ),
        offset: int = Query(0, ge=0, description="Rows to skip."),
    ) -> None:
        self.limit = limit
        self.offset = offset
        response.headers["X-Result-Limit"] = str(limit)
        response.headers["X-Result-Offset"] = str(offset)

    def apply(self, stmt):
        """Bound a SELECT. Returns it unchanged if it cannot be bounded."""
        try:
            return stmt.limit(self.limit).offset(self.offset)
        except AttributeError:
            logger.warning(
                "ListPage.apply() received %s, which cannot be bounded; "
                "the query runs unbounded", type(stmt).__name__,
            )
            return stmt

    def slice(self, rows):
        """Bound an already-materialised sequence, for non-SELECT sources."""
        return list(rows)[self.offset:self.offset + self.limit]


ListPageParams = Annotated[ListPage, Depends()]
