import jwt
import pytest
from app.config import Settings
from pydantic import ValidationError


def test_rejects_privileged_auth_api_keys(monkeypatch):
    for key in [
        "sb_secret_fixture",
        jwt.encode(
            {"role": "service_role"},
            "test-only-classification-key-long-enough",
            algorithm="HS256",
        ),
    ]:
        with pytest.raises(ValidationError, match="public|anon"):
            Settings(_env_file=None, supabase_publishable_key=key)
    anon = jwt.encode(
        {"role": "anon"}, "test-only-classification-key-long-enough", algorithm="HS256"
    )
    assert (
        Settings(_env_file=None, supabase_publishable_key=anon).supabase_publishable_key
        == anon
    )


def test_connection_pool_limits_are_bounded():
    for field, value in [
        ("database_pool_size", 1000),
        ("database_max_overflow", -1),
        ("database_statement_timeout_ms", 0),
        ("scheduler_reconnect_max_seconds", 0),
    ]:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **{field: value})
