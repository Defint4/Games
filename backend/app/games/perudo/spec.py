"""Branchement du Perudo sur la plateforme : la GameSpec du jeu."""

from __future__ import annotations

from collections import Counter

from app.games.base import AfterMove, Event, GameSpec, GameStatus
from app.games.perudo import bots
from app.games.perudo.engine import (
    MAX_PLAYERS,
    MIN_PLAYERS,
    PACO,
    GameState,
    Phase,
    add_player,
    bid,
    calza,
    create_game,
    dudo,
    legal_bids,
    remove_player,
    set_ready,
)
from app.games.perudo.views import game_view
from app.rooms.manager import Room, Seat


class Perudo(GameSpec):
    slug = "perudo"
    name = "Perudo"
    min_players = MIN_PLAYERS
    max_players = MAX_PLAYERS
    bot_difficulties = bots.DIFFICULTIES

    # --- État ----------------------------------------------------------------

    def create_state(self, creator_pseudo: str) -> GameState:
        return create_game(creator_pseudo)

    def add_player(self, state: GameState, pseudo: str) -> None:
        add_player(state, pseudo)

    def remove_player(self, state: GameState, seat: int) -> None:
        remove_player(state, seat)

    def rotate_players(self, state: GameState, k: int) -> None:
        state.players[:] = state.players[k:] + state.players[:k]

    def lobby_changed(self, state: GameState) -> list[Event]:
        # Réaffirmer l'état « prêt » du siège 0 relance le test de démarrage du moteur.
        return set_ready(state, 0, state.players[0].ready) if state.players else []

    def status(self, state: GameState) -> GameStatus:
        return state.status

    def current_turn(self, state: GameState) -> int | None:
        # Gobelets levés : personne n'a la main, la manche suivante part toute seule.
        if state.status is not GameStatus.PLAYING or state.phase is Phase.REVEAL:
            return None
        return state.turn_index

    # --- Vue et actions --------------------------------------------------------

    def view(self, room: Room, seat: int) -> dict:
        return game_view(room, seat)

    def handle_action(
        self, room: Room, seat: int, action: str, message: dict
    ) -> list[Event] | None:
        state = room.state
        if action == "ready":
            return set_ready(state, seat, bool(message.get("ready", True)))
        if action == "bid":
            return bid(state, seat, int(message["quantity"]), int(message["face"]))
        if action == "dudo":
            return dudo(state, seat)
        if action == "calza":
            return calza(state, seat)
        return None

    def auto_play(self, room: Room, seat: int) -> list[Event]:
        """Temps écoulé : la plus petite surenchère sur sa face la plus fréquente,
        ou Dudo si plus rien n'est permis."""
        state = room.state
        options = legal_bids(state, seat)
        if not options:
            return dudo(state, seat)
        dice = state.players[seat].dice
        faces = [d for d in dice if d != PACO] or dice
        favourite = Counter(faces).most_common(1)[0][0] if faces else 2
        on_face = [o for o in options if o[1] == favourite]
        quantity, face = on_face[0] if on_face else options[0]
        return bid(state, seat, quantity, face)

    # --- Fin de partie -----------------------------------------------------------

    def results(self, room: Room) -> tuple[int, int] | None:
        players = room.state.players
        winner = next((i for i, p in enumerate(players) if p.finish_rank == 1), None)
        if winner is None:
            return None
        loser = max(range(len(players)), key=lambda i: players[i].finish_rank or 0)
        return winner, loser

    # --- Bots et manches ---------------------------------------------------------

    def add_bot(self, room: Room, difficulty: str) -> Seat:
        return bots.add_bot(room, difficulty)

    def schedule_bots(self, room: Room, after_move: AfterMove) -> None:
        # Programme aussi la manche suivante après une révélation, bots ou pas.
        bots.schedule(room, after_move)
