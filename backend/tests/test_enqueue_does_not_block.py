# -*- coding: utf-8 -*-
"""
Queuing a background task never holds up the server.

apply_async is a blocking network call. Made inside a request it froze the
event loop (every user's request, not just the caller's) until Redis
answered; with Redis unreachable, a login waited about a minute.
"""
import asyncio
import os
import time

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 40)

from app.celery_app import celery_app, enqueue  # noqa: E402


class SlowTask:
    name = "slow"

    def apply_async(self, **kw):
        time.sleep(2)
        return "queued"


def test_a_slow_broker_does_not_freeze_other_requests():
    async def main():
        ticks = 0

        async def other_request():
            nonlocal ticks
            for _ in range(10):
                await asyncio.sleep(0.05)
                ticks += 1

        result, _ = await asyncio.gather(enqueue(SlowTask(), timeout=0.3), other_request())
        return result, ticks

    result, ticks = asyncio.run(main())
    assert result is None  # gave up after the timeout, reported as not queued
    assert ticks == 10     # the loop kept serving meanwhile


def test_redis_failures_fail_fast():
    conf = celery_app.conf
    assert conf.result_backend_transport_options["retry_policy"]["max_retries"] <= 2
    assert conf.broker_connection_timeout <= 5
