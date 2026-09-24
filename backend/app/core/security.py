import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings

# Un code à 4 chiffres ne résiste pas à une recherche exhaustive hors ligne, quel que soit
# le hachage : sa vraie protection est le blocage après quelques essais (service.py).
# scrypt ralentit juste la lecture d'une base qui aurait fuité.
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(pin.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


# Mot de passe d'administration : deux fois plus coûteux que le PIN (32 Mio de mémoire
# par essai), il n'est vérifié qu'à l'ouverture du panneau, au plus une fois par mois.
_SCRYPT_ADMIN = {"n": 2**15, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT_ADMIN)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT_ADMIN)
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


def create_admin_token(player_id: uuid.UUID, player_version: int, admin_version: int) -> str:
    """Session d'administration, en plus de la session joueur. Liée aux deux versions :
    un changement de code PIN ou de mot de passe admin la révoque."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(player_id),
        "ver": player_version,
        "aver": admin_version,
        "iat": now,
        "exp": now + timedelta(days=settings.admin_session_days),
        "type": "admin",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_admin_token(token: str) -> tuple[uuid.UUID, int, int]:
    """(player_id, version joueur, version admin). Lève jwt.InvalidTokenError sinon."""
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "iat", "sub", "ver", "aver"]},
    )
    if payload.get("type") != "admin":
        raise jwt.InvalidTokenError("wrong token type")
    if not isinstance(payload["ver"], int) or not isinstance(payload["aver"], int):
        raise jwt.InvalidTokenError("malformed version")
    try:
        return uuid.UUID(payload["sub"]), payload["ver"], payload["aver"]
    except (ValueError, TypeError) as exc:
        raise jwt.InvalidTokenError("malformed subject") from exc


def create_player_token(player_id: uuid.UUID, version: int) -> str:
    """`ver` suit Player.token_version : changer de code PIN l'incrémente, ce qui
    déconnecte les autres appareils."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(player_id),
        "ver": version,
        "iat": now,
        "exp": now + timedelta(days=settings.player_token_days),
        "type": "player",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_player_token(token: str) -> tuple[uuid.UUID, int]:
    """Renvoie (player_id, version). Lève jwt.InvalidTokenError si invalide, expiré ou du
    mauvais type. Les jetons émis avant le code PIN n'ont pas de version : 0."""
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "iat", "sub"]},
    )
    if payload.get("type") != "player":
        raise jwt.InvalidTokenError("wrong token type")
    version = payload.get("ver", 0)
    if not isinstance(version, int):
        raise jwt.InvalidTokenError("malformed version")
    try:
        return uuid.UUID(payload["sub"]), version
    except (ValueError, TypeError) as exc:
        raise jwt.InvalidTokenError("malformed subject") from exc
