"""
Failures that genuinely should not fail the request — and a record that they happened.

Some side effects are optional by nature: invalidating a cache entry, rolling
back a session that is already broken, dispatching a notification. If one of
them fails, the work the user asked for has still been done, and turning it into
a 500 would be wrong.

What was wrong was writing that as a bare ``except Exception: pass``. It is
indistinguishable from an oversight, it hides a Redis that has been down for a
week, and applied to a *query* it silently turns a database error into an empty
list — the caller then renders "no students" for a school that has nine hundred.

So there are two rules here, and the second is the important one:

1. Optional side effects use :func:`best_effort`, which swallows *and logs*.
2. Anything that reads or writes the data the caller asked for does not use it
   at all. Let those raise: the error handler turns them into a 500, which is
   the truth, instead of an empty success.
"""
import logging
from contextlib import asynccontextmanager, contextmanager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def best_effort(what: str, *, level: int = logging.WARNING):
    """
    Run an optional side effect; log and continue if it fails.

    ``what`` is what was being attempted, phrased so the log line reads as a
    sentence: ``best_effort("invalidating the finance cache")``.

    Never use this around the request's actual work. See the module docstring.
    """
    try:
        yield
    except Exception as exc:
        logger.log(level, "Best-effort step failed (%s): %s", what, exc, exc_info=True)


@contextmanager
def best_effort_sync(what: str, *, level: int = logging.WARNING):
    """Synchronous :func:`best_effort`, for non-async call sites."""
    try:
        yield
    except Exception as exc:
        logger.log(level, "Best-effort step failed (%s): %s", what, exc, exc_info=True)
