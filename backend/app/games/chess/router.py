"""Les parties d'échecs terminées.

GET  /api/chess/games          les 10 dernières parties du joueur
GET  /api/chess/games/{id}     une partie à relire, coup par coup
POST /api/chess/bot-games      une partie contre l'ordinateur, rejouée puis gardée
PUT  /api/chess/games/{id}/analysis   le bilan calculé sur un appareil, gardé pour tous
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.games.base import GameError
from app.games.chess import service
from app.games.chess.engine import BOT_ELO_RANGE, MAX_PLIES, TIME_CONTROLS
from app.games.chess.models import ChessGame
from app.players.dependencies import get_current_player
from app.players.models import Player

router = APIRouter(prefix="/api/chess", tags=["chess"])


class SideOut(BaseModel):
    id: uuid.UUID | None
    pseudo: str
    avatar: str
    rating: int | None
    delta: int | None


class GameSummaryOut(BaseModel):
    id: uuid.UUID
    white: SideOut
    black: SideOut
    bot_elo: int | None
    time_control: str
    result: str
    termination: str
    plies: int
    ended_at: datetime
    # Précision de chaque camp, une fois le bilan calculé.
    accuracy: dict[str, float] | None = None


class GameOut(GameSummaryOut):
    moves: list[str]
    clocks: list[int] | None
    analysis: dict | None


def _sides(game: ChessGame) -> dict:
    return {
        "white": SideOut(
            id=game.white_id,
            pseudo=game.white_pseudo,
            avatar=game.white_avatar,
            rating=game.white_rating,
            delta=game.white_delta,
        ),
        "black": SideOut(
            id=game.black_id,
            pseudo=game.black_pseudo,
            avatar=game.black_avatar,
            rating=game.black_rating,
            delta=game.black_delta,
        ),
    }


def _accuracy(game: ChessGame) -> dict | None:
    return (game.analysis or {}).get("accuracy")


def _summary(game: ChessGame, accuracy: dict | None) -> dict:
    """`accuracy` à part : la liste des parties ne charge pas le bilan complet."""
    moves = game.moves.split()
    return {
        "id": game.id,
        **_sides(game),
        "bot_elo": game.bot_elo,
        "time_control": game.time_control,
        "result": game.result,
        "termination": game.termination,
        "plies": len(moves),
        "ended_at": game.ended_at,
        "accuracy": accuracy,
    }


@router.get("/games", response_model=list[GameSummaryOut])
async def recent_games(
    player: Player = Depends(get_current_player), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return [_summary(g, accuracy) for g, accuracy in await service.recent_games(db, player.id)]


@router.get("/games/{game_id}", response_model=GameOut)
async def game(
    game_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    found = await service.get_game(db, game_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    return {
        **_summary(found, _accuracy(found)),
        "moves": found.moves.split(),
        "clocks": found.clocks,
        "analysis": found.analysis,
    }


class BotGameIn(BaseModel):
    bot_elo: int = Field(ge=BOT_ELO_RANGE[0], le=BOT_ELO_RANGE[1])
    color: Literal["w", "b"]  # couleur du joueur
    time_control: str
    moves: list[str] = Field(max_length=MAX_PLIES)
    clocks: list[int] | None = Field(default=None, max_length=MAX_PLIES)
    result: str
    termination: str


@router.post("/bot-games", response_model=GameSummaryOut)
@limiter.limit("30/minute")
async def save_bot_game(
    request: Request,
    payload: BotGameIn,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.time_control not in TIME_CONTROLS:
        raise HTTPException(status_code=422, detail="Cadence inconnue.")
    try:
        game = await service.record_bot_game(
            db,
            player,
            payload.bot_elo,
            payload.color,
            payload.time_control,
            payload.moves,
            payload.clocks,
            payload.result,
            payload.termination,
        )
    except GameError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return _summary(game, _accuracy(game))


Classification = Literal[
    "brilliant",
    "great",
    "best",
    "excellent",
    "good",
    "book",
    "inaccuracy",
    "mistake",
    "miss",
    "blunder",
]


class PlyReviewIn(BaseModel):
    eval: int
    best: str = Field(max_length=5)
    bestEval: int  # même nom que côté client
    cls: Classification
    acc: float = Field(ge=0, le=100)


class OpeningIn(BaseModel):
    eco: str = Field(max_length=3)
    name: str = Field(max_length=120)


class GameReviewIn(BaseModel):
    """Le bilan tel que le client le calcule (frontend/src/games/chess/analysis.ts)."""

    v: int = Field(ge=1)
    depth: int = Field(ge=1, le=40)
    start: int
    plies: list[PlyReviewIn] = Field(max_length=MAX_PLIES)
    accuracy: dict[Literal["w", "b"], float]
    elo: dict[Literal["w", "b"], int]
    opening: OpeningIn | None


@router.put("/games/{game_id}/analysis", response_model=GameOut)
@limiter.limit("20/minute")
async def save_analysis(
    request: Request,
    game_id: uuid.UUID,
    payload: GameReviewIn,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Le premier appareil qui ouvre le bilan le calcule et l'envoie ; les suivants le
    lisent. Un bilan d'une version plus récente de l'analyse remplace l'ancien."""
    try:
        found = await service.save_analysis(db, game_id, payload.model_dump())
    except service.GameNotFound:
        raise HTTPException(status_code=404, detail="Partie introuvable.") from None
    except GameError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return {
        **_summary(found, _accuracy(found)),
        "moves": found.moves.split(),
        "clocks": found.clocks,
        "analysis": found.analysis,
    }
