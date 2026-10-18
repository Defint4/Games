"""Le Solitaire : une donne à la fois par joueur, jouée en local, validée à la fin.

GET  /api/solitaire/current          la partie ouverte (null s'il n'y en a pas)
POST /api/solitaire/deal             donne neuve, au hasard ou gagnante ; l'ouverte compte
                                     perdue
POST /api/solitaire/{id}/abandon     partie perdue
POST /api/solitaire/{id}/finish      coups joués → victoire validée, temps du serveur
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.games.base import GameError
from app.games.solitaire import service
from app.games.solitaire.models import SolitaireGame
from app.games.solitaire.solver import NoWinnableDeal
from app.journal import record
from app.players.dependencies import get_current_player
from app.players.models import Player
from app.rooms.manager import manager
from app.rooms.router import MAINTENANCE

router = APIRouter(prefix="/api/solitaire", tags=["solitaire"])

NOT_FOUND = "Donne introuvable."
CLOSED = "Cette partie est déjà terminée."
NO_WINNABLE = "Pas de donne gagnante trouvée, réessaie."
TOO_MANY_DEALS = "Assez de donnes pour aujourd'hui, reviens demain."


class DealOut(BaseModel):
    id: uuid.UUID
    deck: str
    # Temps déjà écoulé côté serveur : le client cale son chrono dessus, quelle que soit
    # l'heure de l'appareil.
    elapsed_ms: int
    # Donne choisie gagnante par le solveur : le client le rappelle en cas d'impasse.
    winnable: bool


class DealRequest(BaseModel):
    winnable: bool = False


class FinishRequest(BaseModel):
    # La borne (MAX_MOVES) est au moteur, qui répond par un message lisible : celle de
    # Pydantic sortirait une liste que le client affiche en « réponse inattendue ».
    moves: list[str]


class FinishOut(BaseModel):
    duration_ms: int
    best_ms: int
    record: bool


def _deal_out(game: SolitaireGame) -> DealOut:
    return DealOut(
        id=game.id, deck=game.deck, elapsed_ms=service.elapsed_ms(game), winnable=game.winnable
    )


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
    payload: DealRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> DealOut:
    if manager.maintenance:
        # Une donne neuve est une nouvelle partie ; la donne en cours, elle, se reprend.
        raise HTTPException(status_code=503, detail=MAINTENANCE)
    try:
        game = await service.deal(db, player.id, payload.winnable)
    except NoWinnableDeal:
        record("warning", "no_winnable_deal", "Le solveur n'a trouvé aucune donne gagnante")
        raise HTTPException(status_code=503, detail=NO_WINNABLE) from None
    except service.TooManyDeals:
        record("warning", "deal_quota", f"Quota de donnes atteint ({service.DEALS_PER_DAY}/jour)")
        raise HTTPException(status_code=429, detail=TOO_MANY_DEALS) from None
    record(
        "info",
        "deal",
        "Donne gagnante servie" if game.winnable else "Donne servie",
        detail={"game_id": str(game.id)},
    )
    return _deal_out(game)


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
        record(
            "warning", "abandon_refused", f"Abandon : {NOT_FOUND}", detail={"game_id": str(game_id)}
        )
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except service.GameClosed:
        record(
            "warning", "abandon_refused", f"Abandon : {CLOSED}", detail={"game_id": str(game_id)}
        )
        raise HTTPException(status_code=409, detail=CLOSED) from None
    record("info", "abandoned", "Partie abandonnée", detail={"game_id": str(game_id)})
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
    about = {"game_id": str(game_id), "moves": len(payload.moves)}
    try:
        victory = await service.finish(db, player.id, game_id, payload.moves)
    except service.GameNotFound:
        record("warning", "finish_refused", f"Victoire : {NOT_FOUND}", detail=about)
        raise HTTPException(status_code=404, detail=NOT_FOUND) from None
    except service.GameClosed:
        record("warning", "finish_refused", f"Victoire : {CLOSED}", detail=about)
        raise HTTPException(status_code=409, detail=CLOSED) from None
    except GameError as exc:
        record("warning", "finish_refused", f"Victoire : {exc}", detail=about)
        raise HTTPException(status_code=422, detail=str(exc)) from None
    record(
        "info",
        "won",
        f"Victoire en {victory.duration_ms / 1000:.1f} s" + (" (record)" if victory.record else ""),
        detail={**about, "duration_ms": victory.duration_ms},
    )
    return FinishOut(
        duration_ms=victory.duration_ms, best_ms=victory.best_ms, record=victory.record
    )
