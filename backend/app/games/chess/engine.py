"""Règles et pendules d'une partie d'échecs en ligne.

python-chess arbitre les coups ; ce module ajoute ce que l'échiquier ne sait pas :
les deux sièges et leurs couleurs, les pendules (temps de base + incrément), l'annulation
avant le premier coup, les propositions de nulle, l'abandon et le temps dépassé.

Comme sur chess.com, les pendules ne tournent qu'à partir du deuxième coup des blancs :
avant, chaque camp a FIRST_MOVE_SECONDS pour jouer son premier coup, sinon la partie
est annulée (sans effet sur l'Elo). Les fonctions reçoivent `now` (time.monotonic()) :
le moteur se teste sans horloge.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import chess

from app.games.base import Event, GameError, GameStatus

# Cadences de chess.com (id → temps de base, incrément, en secondes) ; 0 = sans pendule.
TIME_CONTROLS: dict[str, tuple[int, int]] = {
    "1+0": (60, 0),
    "1+1": (60, 1),
    "2+1": (120, 1),
    "3+0": (180, 0),
    "3+2": (180, 2),
    "5+0": (300, 0),
    "10+0": (600, 0),
    "15+10": (900, 10),
    "30+0": (1800, 0),
    "unlimited": (0, 0),
}
DEFAULT_TIME_CONTROL = "10+0"

FIRST_MOVE_SECONDS = 30
# Latence réseau rendue au joueur à chaque coup : le serveur compte le temps entre sa
# vue envoyée et le coup reçu, aller-retour compris. On décompte plutôt le temps de
# réflexion mesuré par l'appareil, sans jamais rendre plus que MAX_LAG par coup.
MAX_LAG = 0.5

TERMINATIONS = {
    chess.Termination.CHECKMATE: "checkmate",
    chess.Termination.STALEMATE: "stalemate",
    chess.Termination.INSUFFICIENT_MATERIAL: "insufficient",
    chess.Termination.SEVENTYFIVE_MOVES: "fifty",
    chess.Termination.FIVEFOLD_REPETITION: "repetition",
}


@dataclass(slots=True)
class ChessState:
    players: list[str]
    time_control: str = DEFAULT_TIME_CONTROL
    status: GameStatus = GameStatus.LOBBY
    board: chess.Board = field(default_factory=chess.Board)
    white: int = 0  # siège des blancs
    # Temps restant de chaque siège (s) au début du tour en cours.
    clocks: list[float] = field(default_factory=list)
    turn_started: float = 0.0
    # Échéance du premier coup du camp au trait (avant que les pendules tournent).
    first_move_deadline: float | None = None
    # Temps restant (ms) du joueur après chacun de ses coups, pour le bilan.
    move_clocks: list[int] = field(default_factory=list)
    winner: int | None = None
    # "checkmate", "resign", "timeout", "aborted"... ; None tant que la partie court.
    termination: str | None = None
    draw_offer: int | None = None  # siège qui propose nulle
    # Nombre de demi-coups joués lors de la dernière proposition de chaque siège.
    draw_offer_plies: list[int] = field(default_factory=lambda: [-99, -99])
    # Revanche : pseudo de celui qui prend les blancs (couleurs inversées).
    preferred_white: str | None = None
    # Bilan enregistré : variation d'Elo de chaque siège et identifiant de la partie.
    rating_deltas: list[int] | None = None
    game_id: str | None = None
    rng: random.Random = field(default_factory=random.Random)

    @property
    def base(self) -> int:
        return TIME_CONTROLS[self.time_control][0]

    @property
    def increment(self) -> int:
        return TIME_CONTROLS[self.time_control][1]

    @property
    def timed(self) -> bool:
        return self.base > 0

    @property
    def plies(self) -> int:
        return len(self.board.move_stack)

    def seat_of(self, color: chess.Color) -> int:
        return self.white if color == chess.WHITE else 1 - self.white

    def color_of(self, seat: int) -> chess.Color:
        return chess.WHITE if seat == self.white else chess.BLACK

    def to_move(self) -> int:
        return self.seat_of(self.board.turn)

    @property
    def result(self) -> str | None:
        """Résultat PGN ("1-0", "0-1", "1/2-1/2") ; None en cours ou partie annulée."""
        if self.status is not GameStatus.FINISHED or self.termination == "aborted":
            return None
        if self.winner is None:
            return "1/2-1/2"
        return "1-0" if self.winner == self.white else "0-1"


def create_game(creator: str) -> ChessState:
    return ChessState(players=[creator])


def configure(state: ChessState, options: dict) -> None:
    time_control = options.get("time_control", DEFAULT_TIME_CONTROL)
    if time_control not in TIME_CONTROLS:
        raise GameError("Cadence inconnue.")
    state.time_control = time_control
    state.preferred_white = options.get("white")


def add_player(state: ChessState, pseudo: str, now: float) -> list[Event]:
    """Le deuxième joueur s'assoit : la partie démarre aussitôt."""
    if state.status is not GameStatus.LOBBY:
        raise GameError("La partie a déjà commencé.")
    if len(state.players) >= 2:
        raise GameError("La partie est pleine.")
    if pseudo in state.players:
        raise GameError("Ce pseudo est déjà pris dans cette partie.")
    state.players.append(pseudo)
    return _start(state, now)


def remove_player(state: ChessState, seat: int) -> None:
    if state.status is not GameStatus.LOBBY:
        raise GameError("Impossible de retirer un joueur d'une partie commencée.")
    state.players.pop(seat)


def _start(state: ChessState, now: float) -> list[Event]:
    if state.preferred_white in state.players:
        state.white = state.players.index(state.preferred_white)
    else:
        state.white = state.rng.randrange(2)
    state.status = GameStatus.PLAYING
    state.clocks = [float(state.base)] * 2
    state.turn_started = now
    state.first_move_deadline = now + FIRST_MOVE_SECONDS
    return [{"type": "game_started", "white": state.white}]


def clocks_running(state: ChessState) -> bool:
    return state.status is GameStatus.PLAYING and state.timed and state.plies >= 2


def remaining(state: ChessState, seat: int, now: float) -> float | None:
    """Temps restant d'un siège à l'instant `now` (None sans pendule)."""
    if not state.timed:
        return None
    left = state.clocks[seat]
    if clocks_running(state) and seat == state.to_move():
        left -= now - state.turn_started
    return left


def next_deadline(state: ChessState, now: float) -> float | None:
    """Dans combien de secondes le camp au trait perd (temps ou premier coup) ; None
    s'il n'y a rien à surveiller."""
    if state.status is not GameStatus.PLAYING:
        return None
    if state.first_move_deadline is not None:
        return max(0.0, state.first_move_deadline - now)
    left = remaining(state, state.to_move(), now)
    return None if left is None else max(0.0, left + MAX_LAG)


def check_time(state: ChessState, now: float) -> list[Event]:
    """Premier coup pas joué à temps (partie annulée) ou pendule tombée."""
    if state.status is not GameStatus.PLAYING:
        return []
    if state.first_move_deadline is not None:
        if now >= state.first_move_deadline:
            return _finish(state, None, "aborted")
        return []
    seat = state.to_move()
    left = remaining(state, seat, now)
    if left is None or left + MAX_LAG > 0:
        return []
    return _timeout(state, seat)


def _timeout(state: ChessState, seat: int) -> list[Event]:
    state.clocks[seat] = 0.0
    # Temps dépassé face à un adversaire incapable de mater : nulle (règle FIDE).
    opponent = 1 - seat
    if state.board.has_insufficient_material(state.color_of(opponent)):
        return _finish(state, None, "timeout_insufficient")
    return _finish(state, opponent, "timeout")


def play_move(
    state: ChessState, seat: int, uci: str, now: float, think: float | None = None
) -> list[Event]:
    """Joue un coup UCI ("e2e4", "e7e8q"). `think` : temps de réflexion (s) mesuré par
    l'appareil, décompté à la place du temps serveur à MAX_LAG près."""
    if state.status is not GameStatus.PLAYING:
        raise GameError("La partie n'est pas en cours.")
    if seat != state.to_move():
        raise GameError("Ce n'est pas ton tour.")
    try:
        move = chess.Move.from_uci(uci)
    except ValueError:
        raise GameError("Coup illisible.") from None
    if move not in state.board.legal_moves:
        raise GameError("Coup illégal.")

    running = clocks_running(state)
    if running:
        elapsed = now - state.turn_started
        spent = elapsed if think is None else min(max(think, 0.0), elapsed)
        spent = max(spent, elapsed - MAX_LAG)
        if state.clocks[seat] - spent <= 0:
            return _timeout(state, seat)
        state.clocks[seat] += state.increment - spent

    san = state.board.san(move)
    state.board.push(move)
    state.move_clocks.append(round(state.clocks[seat] * 1000))
    state.turn_started = now
    if state.plies == 1:
        state.first_move_deadline = now + FIRST_MOVE_SECONDS
    elif state.plies == 2:
        state.first_move_deadline = None
    # Jouer sans répondre à la proposition de nulle, c'est la décliner.
    if state.draw_offer is not None and state.draw_offer != seat:
        state.draw_offer = None

    events: list[Event] = [{"type": "move", "seat": seat, "uci": uci, "san": san}]
    # Nulles par répétition et par 50 coups prononcées d'office, comme sur chess.com, mais
    # seulement une fois la position vraiment répétée (claim_draw de python-chess
    # l'annoncerait un coup trop tôt).
    outcome = state.board.outcome()
    if outcome is not None:
        winner = None if outcome.winner is None else state.seat_of(outcome.winner)
        events += _finish(state, winner, TERMINATIONS[outcome.termination])
    elif state.board.is_repetition(3):
        events += _finish(state, None, "repetition")
    elif state.board.is_fifty_moves():
        events += _finish(state, None, "fifty")
    return events


def can_abort(state: ChessState, seat: int) -> bool:
    """On annule tant qu'on n'a pas joué son premier coup."""
    if state.status is not GameStatus.PLAYING:
        return False
    first_ply = 0 if seat == state.white else 1
    return state.plies <= first_ply


def abort(state: ChessState, seat: int) -> list[Event]:
    if not can_abort(state, seat):
        raise GameError("Trop tard pour annuler : abandonne plutôt.")
    return _finish(state, None, "aborted", by=seat)


def resign(state: ChessState, seat: int, now: float) -> list[Event]:
    if state.status is not GameStatus.PLAYING:
        raise GameError("La partie n'est pas en cours.")
    _stop_clock(state, now)
    return _finish(state, 1 - seat, "resign", by=seat)


def abandon(state: ChessState, seat: int, now: float) -> list[Event]:
    """Joueur parti trop longtemps à son tour : partie perdue."""
    _stop_clock(state, now)
    return _finish(state, 1 - seat, "abandon", by=seat)


def offer_draw(state: ChessState, seat: int, now: float) -> list[Event]:
    if state.status is not GameStatus.PLAYING:
        raise GameError("La partie n'est pas en cours.")
    if state.draw_offer == 1 - seat:
        return accept_draw(state, seat, now)
    if state.draw_offer == seat or state.plies - state.draw_offer_plies[seat] < 2:
        raise GameError("Tu as déjà proposé nulle.")
    state.draw_offer = seat
    state.draw_offer_plies[seat] = state.plies
    return [{"type": "draw_offered", "seat": seat}]


def accept_draw(state: ChessState, seat: int, now: float) -> list[Event]:
    if state.status is not GameStatus.PLAYING or state.draw_offer != 1 - seat:
        raise GameError("Aucune nulle proposée.")
    _stop_clock(state, now)
    return _finish(state, None, "agreement")


def decline_draw(state: ChessState, seat: int) -> list[Event]:
    if state.status is not GameStatus.PLAYING or state.draw_offer != 1 - seat:
        raise GameError("Aucune nulle proposée.")
    state.draw_offer = None
    return [{"type": "draw_declined", "seat": seat}]


def _stop_clock(state: ChessState, now: float) -> None:
    """Fin de partie en plein tour : la pendule du camp au trait s'arrête là où elle est."""
    if clocks_running(state):
        seat = state.to_move()
        state.clocks[seat] = max(0.0, state.clocks[seat] - (now - state.turn_started))


def _finish(
    state: ChessState, winner: int | None, termination: str, by: int | None = None
) -> list[Event]:
    state.status = GameStatus.FINISHED
    state.winner = winner
    state.termination = termination
    state.draw_offer = None
    state.first_move_deadline = None
    return [{"type": "game_over", "winner": winner, "termination": termination, "by": by}]


# Parties contre l'ordinateur : jouées sur l'appareil, rejouées ici avant d'être gardées.
BOT_ELO_RANGE = (800, 2500)
MAX_PLIES = 1000
CLIENT_TERMINATIONS = {"resign", "timeout", "timeout_insufficient"}


def replay_bot_game(moves: list[str], result: str, termination: str) -> tuple[str, str]:
    """Rejoue une partie jouée contre l'ordinateur et renvoie (résultat, fin) tels que
    l'échiquier les impose. Mat, pat, nulles : c'est la position qui décide. Abandon ou
    temps : l'appareil seul le sait, on le croit (la partie n'est pas classée).
    GameError si un coup est illégal ou si la partie n'a pas vraiment commencé."""
    if len(moves) < 2:
        raise GameError("Partie trop courte.")
    if len(moves) > MAX_PLIES:
        raise GameError("Partie trop longue.")
    board = chess.Board()
    for uci in moves:
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            raise GameError("Coup illisible.") from None
        if move not in board.legal_moves:
            raise GameError("Coup illégal.")
        board.push(move)
    outcome = board.outcome()
    if outcome is not None:
        return outcome.result(), TERMINATIONS[outcome.termination]
    if board.is_repetition(3):
        return "1/2-1/2", "repetition"
    if board.is_fifty_moves():
        return "1/2-1/2", "fifty"
    if termination not in CLIENT_TERMINATIONS or result not in {"1-0", "0-1", "1/2-1/2"}:
        raise GameError("Cette partie n'est pas terminée.")
    return result, termination
