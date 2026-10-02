import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.games.base import GameError
from app.games.solitaire import SLUG
from app.games.solitaire.engine import new_deck, replay
from app.games.solitaire.models import SolitaireGame
from app.games.solitaire.solver import winnable_deck
from app.players.models import Player
from app.players.service import add_solo_result

# Une partie laissée ouverte plus longtemps disparaît, ni gagnée ni perdue : on la
# reprend en revenant dans la journée, pas quatre jours après.
EXPIRY = timedelta(hours=8)


class GameNotFound(Exception):
    pass


class GameClosed(Exception):
    pass


def elapsed_ms(game: SolitaireGame) -> int:
    return int((datetime.now(UTC) - game.started_at).total_seconds() * 1000)


def _expired(game: SolitaireGame, now: datetime) -> bool:
    return game.finished_at is None and now - game.started_at > EXPIRY


async def _drop_expired(db: AsyncSession, player_id: uuid.UUID, now: datetime) -> None:
    await db.execute(
        delete(SolitaireGame).where(
            SolitaireGame.player_id == player_id,
            SolitaireGame.finished_at.is_(None),
            SolitaireGame.started_at < now - EXPIRY,
        )
    )


async def current_game(db: AsyncSession, player_id: uuid.UUID) -> SolitaireGame | None:
    await _drop_expired(db, player_id, datetime.now(UTC))
    await db.commit()
    return await db.scalar(
        select(SolitaireGame)
        .where(SolitaireGame.player_id == player_id, SolitaireGame.finished_at.is_(None))
        .order_by(SolitaireGame.started_at.desc())
        .limit(1)
    )


async def deal(db: AsyncSession, player_id: uuid.UUID, winnable: bool) -> SolitaireGame:
    """Une donne neuve, au hasard ou gagnante (choisie par le solveur). La partie encore
    ouverte, s'il y en a une, compte perdue : on ne change pas de donne gratuitement.
    NoWinnableDeal si le solveur n'a rien gagné, ce qui n'arrive en pratique jamais."""
    # Le solveur occupe le processeur quelques dixièmes de seconde : hors de la boucle, avant
    # le verrou.
    deck = await asyncio.to_thread(winnable_deck) if winnable else new_deck()
    # Verrou sur le joueur : deux donnes demandées en même temps ne laissent pas deux
    # parties ouvertes, et la précédente n'est comptée perdue qu'une fois.
    await db.scalar(select(Player.id).where(Player.id == player_id).with_for_update())
    now = datetime.now(UTC)
    await _drop_expired(db, player_id, now)
    opened = await db.scalars(
        select(SolitaireGame).where(
            SolitaireGame.player_id == player_id, SolitaireGame.finished_at.is_(None)
        )
    )
    for game in opened:
        _close(game, won=False, now=now)
        await add_solo_result(db, SLUG, player_id, won=False)
    game = SolitaireGame(player_id=player_id, deck=deck, winnable=winnable, started_at=now)
    db.add(game)
    await db.commit()
    return game


async def _locked(db: AsyncSession, player_id: uuid.UUID, game_id: uuid.UUID) -> SolitaireGame:
    game = await db.scalar(
        select(SolitaireGame)
        .where(SolitaireGame.id == game_id, SolitaireGame.player_id == player_id)
        .with_for_update()
    )
    if game is None or _expired(game, datetime.now(UTC)):
        raise GameNotFound
    if game.finished_at is not None:
        raise GameClosed
    return game


def _close(game: SolitaireGame, won: bool, now: datetime) -> None:
    game.finished_at = now
    game.won = won


async def abandon(db: AsyncSession, player_id: uuid.UUID, game_id: uuid.UUID) -> None:
    game = await _locked(db, player_id, game_id)
    _close(game, won=False, now=datetime.now(UTC))
    await add_solo_result(db, SLUG, player_id, won=False)
    await db.commit()


@dataclass
class Victory:
    duration_ms: int
    best_ms: int
    record: bool


async def finish(
    db: AsyncSession, player_id: uuid.UUID, game_id: uuid.UUID, moves: list[str]
) -> Victory:
    """Rejoue les coups sur la donne tirée ici : seule une partie réellement gagnée est
    comptée, au temps mesuré par le serveur. GameError si un coup est illégal ou si la
    partie n'est pas finie."""
    game = await _locked(db, player_id, game_id)
    if not replay(game.deck, moves).won():
        raise GameError("Cette partie n'est pas gagnée.")
    now = datetime.now(UTC)
    duration = int((now - game.started_at).total_seconds() * 1000)
    _close(game, won=True, now=now)
    game.duration_ms = duration
    game.moves = len(moves)
    stats = await add_solo_result(db, SLUG, player_id, won=True, duration_ms=duration)
    best = stats.best_ms if stats.best_ms is not None else duration
    await db.commit()
    return Victory(duration_ms=duration, best_ms=best, record=best == duration)
