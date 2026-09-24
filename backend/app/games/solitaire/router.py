"""Le Solitaire : une donne à la fois par joueur, jouée en local, validée à la fin.

GET  /api/solitaire/current          la partie ouverte (null s'il n'y en a pas)
POST /api/solitaire/deal             donne neuve ; l'ouverte compte perdue
POST /api/solitaire/{id}/abandon     partie perdue
POST /api/solitaire/{id}/finish      coups joués → victoire validée, temps du serveur
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.games.base import GameError
from app.games.solitaire import service
from app.games.solitaire.engine import MAX_MOVES
from app.games.solitaire.models import SolitaireGame
from app.players.dependencies import get_current_player
from app.players.models import Player

router = APIRouter(prefix="/api/solitaire", tags=["solitaire"])

NOT_FOUND = "Donne introuvable."
CLOSED = "Cette partie est déjà terminée."


class DealOut(BaseModel):
    id: uuid.UUID
    deck: str
    # Temps déjà écoulé côté serveur : le client cale son chrono dessus, quelle que soit
    # l'heure de l'appareil.
    elapsed_ms: int


class FinishRequest(BaseModel):
    moves: list[str] = Field(max_length=MAX_MOVES)


class FinishOut(BaseModel):
    duration_ms: int
    best_ms: int
    record: bool


def _deal_out(game: SolitaireGame) -> DealOut:
    return DealOut(id=game.id, deck=game.deck, elapsed_ms=service.elapsed_ms(game))


@router.get("/current", response_model=DealOut | None)
async def current(
    player: Player = Depends(get_current_player), db: AsyncSession = Depends(get_db)
) -> DealOut | None:
    game = await service.current_game(db, player.id)
    return None if game is None else _deal_out(game)


@router.post("/deal", response_model=DealOut)
@limiter.limit("30/minute")
async def deal(
    request: Request,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> DealOut:
    return _deal_out(await service.deal(db, player.id))


@router.post("/{game_id}/abandon", status_code=204)
@limiter.limit("30/minute")
async def abandon(
    request: Request,
    game_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await service.abandon(db, player.id, game_id)
    except service.GameNotFound:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except service.GameClosed:
        raise HTTPException(status_code=409, detail=CLOSED) from None
    return Response(status_code=204)


@router.post("/{game_id}/finish", response_model=FinishOut)
@limiter.limit("30/minute")
async def finish(
    request: Request,
    game_id: uuid.UUID,
    payload: FinishRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> FinishOut:
    try:
        victory = await service.finish(db, player.id, game_id, payload.moves)
    except service.GameNotFound:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except service.GameClosed:
        raise HTTPException(status_code=409, detail=CLOSED) from None
    except GameError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return FinishOut(
        duration_ms=victory.duration_ms, best_ms=victory.best_ms, record=victory.record
    )
