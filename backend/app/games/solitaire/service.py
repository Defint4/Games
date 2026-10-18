import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.games.base import GameError
from app.games.solitaire import SLUG
from app.games.solitaire.engine import new_deck, replay
from app.games.solitaire.models import SolitaireGame
from app.games.solitaire.solver import winnable_deck
from app.journal import record
from app.players.models import Player, PlayerGameStats
from app.players.service import add_solo_result

logger = logging.getLogger(__name__)

# Une partie laissée ouverte plus longtemps disparaît, ni gagnée ni perdue : on la
# reprend en revenant dans la journée, pas quatre jours après.
EXPIRY = timedelta(hours=8)
# Les parties finies ne servent qu'au détail d'un joueur : au-delà, elles partent.
RETENTION = timedelta(days=90)
PURGE_EVERY_S = 3600
# Donnes par joueur et par jour : un humain qui enchaîne n'approche pas, un script oui.
DEALS_PER_DAY = 200
# Une victoire plus rapide que ça n'est pas jouée à la main : la donne est connue dès le
# deal, un solveur la gagne en moins d'une seconde. Les coups de la fin automatique
# comptent dans le total, pas dans le temps, d'où une marge large par coup.
MIN_DURATION_MS = 30_000
MIN_MS_PER_MOVE = 200

# Le solveur occupe un cœur quelques dixièmes de seconde : un seul à la fois, sinon
# dix demandes en parallèle gèlent les tables des autres jeux.
_solver_slot = asyncio.Semaphore(1)


class GameNotFound(Exception):
    pass


class GameClosed(Exception):
    pass


class TooManyDeals(Exception):
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
    # Les expirées sont simplement ignorées (purge_loop les supprime) : pas d'écriture à
    # chaque visite de l'accueil.
    now = datetime.now(UTC)
    return await db.scalar(
        select(SolitaireGame)
        .where(
            SolitaireGame.player_id == player_id,
            SolitaireGame.finished_at.is_(None),
            SolitaireGame.started_at >= now - EXPIRY,
        )
        .order_by(SolitaireGame.started_at.desc())
        .limit(1)
    )


async def purge_loop() -> None:
    """Supprime les parties ouvertes expirées et les finies trop anciennes, toutes les
    heures. Une erreur ne doit pas arrêter la boucle pour de bon."""
    while True:
        await asyncio.sleep(PURGE_EVERY_S)
        try:
            now = datetime.now(UTC)
            async with async_session_maker() as db:
                expired = await db.execute(
                    delete(SolitaireGame).where(
                        SolitaireGame.finished_at.is_(None),
                        SolitaireGame.started_at < now - EXPIRY,
                    )
                )
                old = await db.execute(
                    delete(SolitaireGame).where(SolitaireGame.finished_at < now - RETENTION)
                )
                await db.commit()
            if expired.rowcount or old.rowcount:
                logger.info(
                    "solitaire: purge de %d partie(s) expirée(s), %d ancienne(s)",
                    expired.rowcount,
                    old.rowcount,
                )
        except Exception:
            logger.exception("Échec de la purge des parties de Solitaire")


async def deal(db: AsyncSession, player_id: uuid.UUID, winnable: bool) -> SolitaireGame:
    """Une donne neuve, au hasard ou gagnante (choisie par le solveur). La partie encore
    ouverte, s'il y en a une, compte perdue : on ne change pas de donne gratuitement.
    NoWinnableDeal si le solveur n'a rien gagné, ce qui n'arrive en pratique jamais ;
    TooManyDeals au-delà du quota quotidien."""
    now = datetime.now(UTC)
    today = await db.scalar(
        select(func.count())
        .select_from(SolitaireGame)
        .where(
            SolitaireGame.player_id == player_id,
            SolitaireGame.started_at >= now - timedelta(days=1),
        )
    )
    if today is not None and today >= DEALS_PER_DAY:
        raise TooManyDeals
    # Le solveur occupe le processeur quelques dixièmes de seconde : hors de la boucle,
    # un seul à la fois, et avant le verrou.
    if winnable:
        async with _solver_slot:
            deck = await asyncio.to_thread(winnable_deck)
    else:
        deck = new_deck()
    # Verrou sur le joueur : deux donnes demandées en même temps ne laissent pas deux
    # parties ouvertes, et la précédente n'est comptée perdue qu'une fois.
    await db.scalar(select(Player.id).where(Player.id == player_id).with_for_update())
    now = datetime.now(UTC)
    await _drop_expired(db, player_id, now)
    # Verrou sur les parties ouvertes aussi : un finish en cours sur l'une d'elles tient
    # sa ligne ; sans ça, on la relirait ouverte et on écraserait sa victoire en défaite.
    # Verrouillée, la ligne est relue après son commit et n'est plus « ouverte ».
    opened = await db.scalars(
        select(SolitaireGame)
        .where(SolitaireGame.player_id == player_id, SolitaireGame.finished_at.is_(None))
        .with_for_update()
    )
    for game in opened:
        _close(game, won=False, now=now)
        await add_solo_result(db, SLUG, player_id, won=False)
    game = SolitaireGame(player_id=player_id, deck=deck, winnable=winnable, started_at=now)
    db.add(game)
    await db.commit()
    return game


async def _locked(
    db: AsyncSession, player_id: uuid.UUID, game_id: uuid.UUID, closed_ok: bool = False
) -> SolitaireGame:
    game = await db.scalar(
        select(SolitaireGame)
        .where(SolitaireGame.id == game_id, SolitaireGame.player_id == player_id)
        .with_for_update()
    )
    if game is None or _expired(game, datetime.now(UTC)):
        raise GameNotFound
    if game.finished_at is not None and not closed_ok:
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
    game = await _locked(db, player_id, game_id, closed_ok=True)
    if game.finished_at is not None:
        # Déjà validée (l'app a été tuée pendant l'animation et renvoie) : même réponse
        # qu'à la première fois, plutôt qu'une erreur sur un écran de victoire.
        if game.won and game.duration_ms is not None:
            stats = await db.get(PlayerGameStats, (player_id, SLUG))
            best = stats.best_ms if stats and stats.best_ms is not None else game.duration_ms
            return Victory(
                duration_ms=game.duration_ms, best_ms=best, record=best == game.duration_ms
            )
        raise GameClosed
    if not replay(game.deck, moves).won():
        raise GameError("Cette partie n'est pas gagnée.")
    now = datetime.now(UTC)
    duration = int((now - game.started_at).total_seconds() * 1000)
    if duration < max(MIN_DURATION_MS, MIN_MS_PER_MOVE * len(moves)):
        # Pas une main humaine : comptée perdue, pour ne pas laisser une partie ouverte
        # qu'on ne pourrait jamais finir.
        _close(game, won=False, now=now)
        await add_solo_result(db, SLUG, player_id, won=False)
        await db.commit()
        record(
            "warning",
            "cheat_suspected",
            f"Victoire trop rapide : {len(moves)} coups en {duration / 1000:.1f} s",
            game=SLUG,
            player=player_id,
            detail={"game_id": str(game_id), "winnable": game.winnable},
        )
        raise GameError("Partie trop rapide pour être jouée à la main.")
    _close(game, won=True, now=now)
    game.duration_ms = duration
    game.moves = len(moves)
    stats = await add_solo_result(db, SLUG, player_id, won=True, duration_ms=duration)
    best = stats.best_ms if stats.best_ms is not None else duration
    await db.commit()
    return Victory(duration_ms=duration, best_ms=best, record=best == duration)
