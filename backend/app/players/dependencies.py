import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_player_token
from app.players import service
from app.players.models import Player

_bearer = HTTPBearer(auto_error=False)

SESSION_REVOKED = "Session fermée : le code PIN de ce compte a changé."


def get_player_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> tuple[uuid.UUID, int]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Jeton manquant.")
    try:
        return decode_player_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide ou expiré.") from None


async def get_current_player(
    claims: tuple[uuid.UUID, int] = Depends(get_player_claims),
    db: AsyncSession = Depends(get_db),
) -> Player:
    player_id, version = claims
    player = await service.get_player(db, player_id)
    if player is None:
        raise HTTPException(status_code=401, detail="Profil introuvable.")
    if version != player.token_version:
        raise HTTPException(status_code=401, detail=SESSION_REVOKED)
    return player
