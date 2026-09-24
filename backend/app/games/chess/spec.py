"""Branchement des échecs sur la plateforme : la GameSpec du jeu.

Les parties en ligne se jouent à deux humains, dès que le second rejoint la table. Les
bots tournent sur l'appareil du joueur (Stockfish dans le navigateur) : aucun calcul
d'échecs côté serveur, hormis l'arbitrage des coups.
"""

from __future__ import annotations

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.games.base import AfterMove, Event, GameSpec, GameStatus
from app.games.chess import SLUG, clock, service
from app.games.chess.engine import (
    ChessState,
    abandon,
    abort,
    accept_draw,
    add_player,
    configure,
    create_game,
    decline_draw,
    offer_draw,
    play_move,
    remove_player,
    resign,
)
from app.games.chess.rating import INITIAL_RATING
from app.games.chess.views import game_view
from app.rooms.manager import Room

# Joueur parti à son tour : 5 minutes avant de perdre par abandon (la pendule, elle,
# continue de tourner).
ABSENT_SECONDS = 300


class Chess(GameSpec):
    slug = SLUG
    name = "Échecs"
    min_players = 2
    max_players = 2
    absent_seconds = ABSENT_SECONDS
    initial_rating = INITIAL_RATING
    rematch_consent = True

    # --- État ----------------------------------------------------------------

    def create_state(self, creator_pseudo: str) -> ChessState:
        return create_game(creator_pseudo)

    def configure(self, state: ChessState, options: dict) -> None:
        configure(state, options)

    def add_player(self, state: ChessState, pseudo: str) -> None:
        add_player(state, pseudo, time.monotonic())

    def remove_player(self, state: ChessState, seat: int) -> None:
        remove_player(state, seat)

    def rotate_players(self, state: ChessState, k: int) -> None:
        state.players[:] = state.players[k:] + state.players[:k]
        state.white = (state.white - k) % 2

    def status(self, state: ChessState) -> GameStatus:
        return state.status

    def current_turn(self, state: ChessState) -> int | None:
        return state.to_move() if state.status is GameStatus.PLAYING else None

    def summary(self, room: Room) -> dict:
        return {"time_control": room.state.time_control}

    def rematch_options(self, room: Room) -> dict:
        # Couleurs inversées : les noirs de cette partie prennent les blancs.
        state: ChessState = room.state
        return {"white": state.players[1 - state.white]}

    # --- Vue et actions --------------------------------------------------------

    def view(self, room: Room, seat: int) -> dict:
        return game_view(room, seat)

    def handle_action(
        self, room: Room, seat: int, action: str, message: dict
    ) -> list[Event] | None:
        state: ChessState = room.state
        now = time.monotonic()
        if action == "move":
            think = message.get("think_ms")
            return play_move(
                state,
                seat,
                str(message["uci"]),
                now,
                None if think is None else float(think) / 1000,
            )
        if action == "resign":
            return resign(state, seat, now)
        if action == "abort":
            return abort(state, seat)
        if action == "offer_draw":
            return offer_draw(state, seat, now)
        if action == "accept_draw":
            return accept_draw(state, seat, now)
        if action == "decline_draw":
            return decline_draw(state, seat)
        return None

    def auto_play(self, room: Room, seat: int) -> list[Event]:
        """Parti trop longtemps à son tour : partie perdue par abandon."""
        return abandon(room.state, seat, time.monotonic())

    # --- Fin de partie -----------------------------------------------------------

    def results(self, room: Room) -> tuple[int, int] | None:
        winner = room.state.winner
        return None if winner is None else (winner, 1 - winner)

    async def record_results(self, room: Room, db: AsyncSession) -> bool:
        await service.record_online_game(db, room)
        return True

    # --- Pendules ------------------------------------------------------------------

    def schedule_bots(self, room: Room, after_move: AfterMove) -> None:
        # Pas de bot serveur : le crochet d'après-coup surveille les pendules.
        clock.schedule(room, after_move)
