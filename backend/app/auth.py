"""Supabase bearer verification. No passwords or service-role keys are accepted."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import httpx
import jwt
from app.config import settings
from fastapi import Header, HTTPException


@dataclass(frozen=True)
class Identity:
    user_id: UUID
    email: str
    profile: dict


@lru_cache(maxsize=4)
def signing_keys(url):
    return jwt.PyJWKClient(
        f"{url}/auth/v1/.well-known/jwks.json", lifespan=300, timeout=5
    )


def verify_claims(token):
    url = settings.supabase_url.rstrip("/")
    if not url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Account authentication is not configured")
    try:
        key = signing_keys(url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{url}/auth/v1",
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
        UUID(claims["sub"])
        if claims.get("role") != "authenticated" or claims.get("is_anonymous"):
            raise jwt.InvalidTokenError()
        return claims
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(
            503, "Account verification temporarily unavailable"
        ) from None
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            401, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"}
        ) from None


def current_user(authorization: Annotated[str | None, Header()] = None):
    if (
        not authorization
        or not authorization.startswith("Bearer ")
        or len(authorization) > 16384
    ):
        raise HTTPException(
            401, "Sign in required", headers={"WWW-Authenticate": "Bearer"}
        )
    token = authorization[7:]
    claims = verify_claims(token)
    # Auth's user endpoint checks current user existence/bans as well as the token.
    # Do not persist/cache private profiles or log tokens.
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": authorization,
            },
            timeout=5,
        )
        if response.status_code in (401, 403):
            raise HTTPException(401, "Session no longer available")
        if response.status_code != 200:
            raise HTTPException(503, "Account verification temporarily unavailable")
        profile = response.json()
        if profile.get("id") != claims["sub"]:
            raise HTTPException(401, "Invalid session identity")
        if not profile.get("email_confirmed_at"):
            raise HTTPException(403, "Verify your email before continuing")
        return Identity(UUID(claims["sub"]), profile.get("email", ""), profile)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            503, "Account verification temporarily unavailable"
        ) from None
