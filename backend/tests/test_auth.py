import time
import uuid
from types import SimpleNamespace

import httpx
import jwt
import pytest
from app import auth
from app.config import settings
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException


@pytest.fixture
def credentials(monkeypatch):
    private = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_publishable_key", "public-test-key")
    monkeypatch.setattr(
        auth,
        "signing_keys",
        lambda url: SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(
                key=private.public_key()
            )
        ),
    )
    claims = dict(
        sub=str(uuid.uuid4()),
        iss="https://example.supabase.co/auth/v1",
        aud="authenticated",
        role="authenticated",
        iat=int(time.time()),
        exp=int(time.time()) + 300,
    )
    return private, claims


def test_valid_signature_and_identity(credentials):
    key, claims = credentials
    assert (
        auth.verify_claims(jwt.encode(claims, key, algorithm="ES256"))["sub"]
        == claims["sub"]
    )


@pytest.mark.parametrize(
    "change",
    [
        dict(exp=1),
        dict(iss="https://attacker"),
        dict(aud="anon"),
        dict(role="service_role"),
        dict(sub="bad"),
        dict(is_anonymous=True),
        dict(iat=int(time.time()) + 3600),
    ],
)
def test_reject_invalid_claims(credentials, change):
    key, claims = credentials
    with pytest.raises(HTTPException) as failure:
        auth.verify_claims(jwt.encode({**claims, **change}, key, algorithm="ES256"))
    assert failure.value.status_code == 401


def test_reject_wrong_signature_and_missing_exp(credentials):
    key, claims = credentials
    for token in [
        jwt.encode(claims, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256"),
        jwt.encode(
            {k: v for k, v in claims.items() if k != "exp"}, key, algorithm="ES256"
        ),
        "not-a-token",
    ]:
        with pytest.raises(HTTPException) as failure:
            auth.verify_claims(token)
        assert failure.value.status_code == 401


def test_missing_auth_and_configuration(monkeypatch):
    with pytest.raises(HTTPException) as failure:
        auth.current_user(None)
    assert failure.value.status_code == 401
    monkeypatch.setattr(settings, "supabase_url", "")
    with pytest.raises(HTTPException) as failure:
        auth.verify_claims("anything")
    assert failure.value.status_code == 503


@pytest.mark.parametrize(
    "status,profile,expected",
    [
        (401, {}, 401),
        (503, {}, 503),
        (200, {"id": "wrong"}, 401),
        (200, {}, 403),
        (200, {"email_confirmed_at": "2026-01-01"}, 200),
    ],
)
def test_current_account_checks(credentials, monkeypatch, status, profile, expected):
    key, claims = credentials
    token = jwt.encode(claims, key, algorithm="ES256")
    profile = {"id": claims["sub"], "email": "test@example.test", **profile}
    monkeypatch.setattr(
        auth.httpx, "get", lambda *a, **kw: httpx.Response(status, json=profile)
    )
    if expected == 200:
        assert str(auth.current_user("Bearer " + token).user_id) == claims["sub"]
    else:
        with pytest.raises(HTTPException) as failure:
            auth.current_user("Bearer " + token)
        assert failure.value.status_code == expected
