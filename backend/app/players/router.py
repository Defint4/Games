from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import create_player_token
from app.games.registry import is_game
from app.players import service
from app.players.dependencies import get_current_player
from app.players.models import Player
from app.players.schemas import (
    ChangePinRequest,
    EnterRequest,
    EnterResponse,
    LeaderboardOut,
    MeOut,
    PlayerOut,
    UpdateMeRequest,
)

router = APIRouter(prefix="/api/players", tags=["players"])

PIN_LOCKED = "Trop d'essais : ce compte est bloqué quelques minutes."


def _session(player: Player) -> EnterResponse:
    return EnterResponse(
        player=MeOut.from_player(player),
        token=create_player_token(player.id, player.token_version),
    )


@router.post("/enter", response_model=EnterResponse)
@limiter.limit("10/minute")
async def enter(
    request: Request, payload: EnterRequest, db: AsyncSession = Depends(get_db)
) -> EnterResponse:
    try:
        player = await service.enter(db, payload.pseudo, payload.pin, payload.avatar)
    except service.WrongPin:
        raise HTTPException(status_code=403, detail="Code PIN incorrect.") from None
    except service.PinLocked:
        raise HTTPException(status_code=423, detail=PIN_LOCKED) from None
    except service.AvatarRequired:
        raise HTTPException(status_code=422, detail="Choisis un avatar.") from None
    except service.PseudoTaken:
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris.") from None
    return _session(player)


@router.get("/me", response_model=MeOut)
async def me(player: Player = Depends(get_current_player)) -> MeOut:
    return MeOut.from_player(player)


@router.post("/me/refresh", response_model=EnterResponse)
@limiter.limit("30/minute")
async def refresh(request: Request, player: Player = Depends(get_current_player)) -> EnterResponse:
    """Jeton neuf à chaque ouverture de l'app : la session court tant qu'on revient
    avant son expiration."""
    return _session(player)


@router.put("/me/pin", response_model=EnterResponse)
@limiter.limit("10/minute")
async def change_pin(
    request: Request,
    payload: ChangePinRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> EnterResponse:
    """Nouveau jeton en retour : l'ancien, comme ceux des autres appareils, est révoqué."""
    try:
        player = await service.change_pin(db, player, payload.current_pin, payload.new_pin)
    except service.WrongPin:
        raise HTTPException(status_code=403, detail="Code PIN actuel incorrect.") from None
    except service.PinLocked:
        raise HTTPException(status_code=423, detail=PIN_LOCKED) from None
    return _session(player)


@router.patch("/me", response_model=MeOut)
@limiter.limit("20/minute")
async def update_me(
    request: Request,
    payload: UpdateMeRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> MeOut:
    try:
        player = await service.update_profile(db, player, payload.pseudo, payload.avatar)
    except service.PseudoTaken:
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris.") from None
    return MeOut.from_player(player)


@router.get("/leaderboard", response_model=LeaderboardOut)
@limiter.limit("60/minute")
async def leaderboard(
    request: Request,
    game: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    me: str | None = Query(None, max_length=20),
    db: AsyncSession = Depends(get_db),
) -> LeaderboardOut:
    """Classement d'un jeu (slug) ou de tous les jeux cumulés, page par page."""
    if game is not None and not is_game(game):
        raise HTTPException(status_code=404, detail="Jeu inconnu.")
    page = await service.leaderboard(db, game, offset, limit, me)
    return LeaderboardOut.model_validate(page)


@router.get("/by-pseudo/{pseudo}", response_model=PlayerOut)
@limiter.limit("60/minute")
async def by_pseudo(request: Request, pseudo: str, db: AsyncSession = Depends(get_db)) -> PlayerOut:
    """Profil public d'un joueur (stats affichées en tapant son avatar à la table)."""
    player = await db.scalar(select(Player).where(Player.pseudo_key == pseudo.lower()))
    if player is None:
        raise HTTPException(status_code=404, detail="Joueur inconnu.")
    return PlayerOut.from_player(player)
