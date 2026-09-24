"""Deux verrous pour chaque appel admin.

1. La session joueur (jeton Bearer, ouverte par le code PIN) doit être celle du compte
   administrateur. Sinon : 404, exactement comme une route qui n'existe pas — le panneau
   ne se révèle à personne d'autre.
2. La session admin, ouverte par le mot de passe, dans un cookie httpOnly limité à
   /api/admin : illisible par le JavaScript de la page, donc hors de portée d'une faille
   XSS, et absente de l'appareil de quiconque n'a que le code PIN. SameSite=Strict, et
   l'en-tête Authorization exigé en plus : une requête forgée depuis un autre site n'a ni
   l'un ni l'autre.
"""

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import service
from app.admin.models import AdminCredential
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_admin_token, decode_admin_token, decode_player_token
from app.players.models import Player

ADMIN_COOKIE = "games_admin"
ADMIN_PATH = "/api/admin"
PASSWORD_REQUIRED = "Mot de passe administrateur requis."

_bearer = HTTPBearer(auto_error=False)


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Not Found")


async def get_admin_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> tuple[Player, AdminCredential]:
    """Le compte administrateur, connecté par son code PIN (verrou 1)."""
    if credentials is None:
        raise _not_found()
    try:
        player_id, version = decode_player_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise _not_found() from None
    cred = await service.get_credential(db, player_id)
    if cred is None:
        raise _not_found()
    player = await db.get(Player, player_id)
    if player is None or player.token_version != version or player.suspended_at is not None:
        raise _not_found()
    return player, cred


async def require_admin(
    request: Request,
    admin: tuple[Player, AdminCredential] = Depends(get_admin_player),
) -> Player:
    """Verrou 2 : la session ouverte par le mot de passe admin."""
    player, cred = admin
    try:
        player_id, version, admin_version = decode_admin_token(
            request.cookies.get(ADMIN_COOKIE) or ""
        )
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail=PASSWORD_REQUIRED) from None
    if (
        player_id != player.id
        or version != player.token_version
        or admin_version != cred.session_version
    ):
        raise HTTPException(status_code=401, detail=PASSWORD_REQUIRED)
    return player


def no_store(response: Response) -> None:
    """Rien de ce qui sort du panneau ne reste dans un cache."""
    response.headers["Cache-Control"] = "no-store"


def set_admin_cookie(response: Response, player: Player, cred: AdminCredential) -> None:
    response.set_cookie(
        ADMIN_COOKIE,
        create_admin_token(player.id, player.token_version, cred.session_version),
        max_age=settings.admin_session_days * 24 * 3600,
        path=ADMIN_PATH,
        httponly=True,
        # En développement, l'API est servie en http sur l'IP du réseau local.
        secure=settings.environment == "production",
        samesite="strict",
    )


def clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(
        ADMIN_COOKIE,
        path=ADMIN_PATH,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
    )


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
