# -*- coding: utf-8 -*-
"""The deploy applies the listed SQL migrations; they must exist and be ordered."""
import io
from pathlib import Path

from app.sql_migrations import MIGRATIONS

REPO = Path(__file__).resolve().parents[2]


def test_every_listed_migration_exists_in_order():
    assert MIGRATIONS == sorted(MIGRATIONS)
    for name in MIGRATIONS:
        assert (REPO / "supabase" / "migrations" / name).is_file(), name


def test_the_deploy_runs_them_and_the_image_contains_them():
    assert "apply_sql_migrations" in io.open("app/db_bootstrap.py", encoding="utf-8").read()
    docker = io.open(REPO / "Dockerfile", encoding="utf-8").read()
    assert "COPY supabase/migrations/ /app/sql_migrations/" in docker
    ignore = io.open(REPO / ".dockerignore", encoding="utf-8").read()
    assert "!supabase/migrations" in ignore and "**/.env" in ignore


def test_listed_migrations_are_idempotent_transactions():
    for name in MIGRATIONS:
        sql = io.open(REPO / "supabase" / "migrations" / name, encoding="utf-8").read()
        assert "BEGIN;" in sql and "COMMIT;" in sql, name
        assert "Idempotent" in sql, name
