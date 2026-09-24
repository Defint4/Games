import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.games.base import GameError
from app.games.chess import SLUG
from app.games.chess.engine import ChessState, replay_bot_game
from app.games.chess.models import ChessGame
from app.games.chess.rating import INITIAL_RATING, delta
from app.players.models import Player, PlayerGameStats
from app.rooms.manager import Room

RECENT_GAMES = 10


class GameNotFound(Exception):
    pass


async def record_online_game(db: AsyncSession, room: Room) -> None:
    """Fin d'une partie en ligne : stats et Elo des deux joueurs, partie archivée.
    Une partie annulée ne compte pas. Les nouvelles cotes repartent dans les sièges
    (revanche) et les variations dans l'état (écran de fin)."""
    state: ChessState = room.state
    result = state.result
    if result is None:
        return
    seats = [state.white, 1 - state.white]  # blancs, noirs
    ids = [room.seats[i].player_id for i in seats]
    # Lignes verrouillées dans un ordre fixe : deux parties qui finissent ensemble avec un
    # joueur en commun ne s'interbloquent pas.
    rows = {
        s.player_id: s
        for s in await db.scalars(
            select(PlayerGameStats)
            .where(PlayerGameStats.game == SLUG, PlayerGameStats.player_id.in_(ids))
            .order_by(PlayerGameStats.player_id)
            .with_for_update()
        )
    }
    for player_id in ids:
        if player_id not in rows:
            rows[player_id] = PlayerGameStats(
                player_id=player_id, game=SLUG, played=0, won=0, lost=0, rating=None
            )
            db.add(rows[player_id])

    stats = [rows[i] for i in ids]
    before = [s.rating if s.rating is not None else INITIAL_RATING for s in stats]
    white_score = {"1-0": 1.0, "0-1": 0.0}.get(result, 0.5)
    scores = [white_score, 1 - white_score]
    deltas = [delta(before[c], before[1 - c], scores[c], stats[c].played) for c in (0, 1)]
    for c, s in enumerate(stats):
        s.played += 1
        if scores[c] == 1:
            s.won += 1
        elif scores[c] == 0:
            s.lost += 1
        s.rating = before[c] + deltas[c]

    white, black = (room.seats[i] for i in seats)
    game = ChessGame(
        white_id=white.player_id,
        black_id=black.player_id,
        white_pseudo=white.pseudo,
        black_pseudo=black.pseudo,
        white_avatar=white.avatar,
        black_avatar=black.avatar,
        white_rating=before[0],
        black_rating=before[1],
        white_delta=deltas[0],
        black_delta=deltas[1],
        time_control=state.time_control,
        result=result,
        termination=state.termination or "",
        moves=" ".join(m.uci() for m in state.board.move_stack),
        clocks=state.move_clocks if state.timed else None,
        ended_at=datetime.now(UTC),
    )
    db.add(game)
    await db.commit()

    state.rating_deltas = [0, 0]
    for c, seat in enumerate(seats):
        state.rating_deltas[seat] = deltas[c]
        room.seats[seat].rating = before[c] + deltas[c]
    state.game_id = str(game.id)


BOT_PSEUDO = "Ordinateur"
BOT_AVATAR = "robot-0"


async def record_bot_game(
    db: AsyncSession,
    player: Player,
    bot_elo: int,
    color: str,
    time_control: str,
    moves: list[str],
    clocks: list[int] | None,
    result: str,
    termination: str,
) -> ChessGame:
    """Une partie contre l'ordinateur, rejouée puis archivée pour le bilan. Non classée :
    ni Elo, ni stats (on ne gonfle pas ses victoires contre un bot faible)."""
    result, termination = replay_bot_game(moves, result, termination)
    me = {"id": player.id, "pseudo": player.pseudo, "avatar": player.avatar}
    bot = {"id": None, "pseudo": BOT_PSEUDO, "avatar": BOT_AVATAR}
    white, black = (me, bot) if color == "w" else (bot, me)
    game = ChessGame(
        white_id=white["id"],
        black_id=black["id"],
        white_pseudo=white["pseudo"],
        black_pseudo=black["pseudo"],
        white_avatar=white["avatar"],
        black_avatar=black["avatar"],
        bot_elo=bot_elo,
        time_control=time_control,
        result=result,
        termination=termination,
        moves=" ".join(moves),
        clocks=clocks,
        ended_at=datetime.now(UTC),
    )
    db.add(game)
    await db.commit()
    return game


async def recent_games(
    db: AsyncSession, player_id: uuid.UUID
) -> list[tuple[ChessGame, dict | None]]:
    """Les dernières parties et la précision de leur bilan. Le bilan complet (une
    évaluation par demi-coup, plusieurs Ko par partie) reste en base : la liste n'en
    affiche que la précision."""
    rows = await db.execute(
        select(ChessGame, ChessGame.analysis["accuracy"])
        .options(defer(ChessGame.analysis))
        .where(or_(ChessGame.white_id == player_id, ChessGame.black_id == player_id))
        .order_by(ChessGame.ended_at.desc())
        .limit(RECENT_GAMES)
    )
    return [(game, accuracy) for game, accuracy in rows.all()]


async def get_game(db: AsyncSession, game_id: uuid.UUID) -> ChessGame | None:
    return await db.get(ChessGame, game_id)


async def save_analysis(db: AsyncSession, game_id: uuid.UUID, analysis: dict) -> ChessGame:
    """Garde le bilan s'il n'y en a pas, ou s'il vient d'une version plus récente."""
    game = await db.scalar(select(ChessGame).where(ChessGame.id == game_id).with_for_update())
    if game is None:
        raise GameNotFound
    if len(analysis["plies"]) != len(game.moves.split()):
        raise GameError("Ce bilan ne correspond pas à la partie.")
    current = game.analysis or {}
    if current.get("v", 0) < analysis["v"]:
        game.analysis = analysis
        await db.commit()
    return game
