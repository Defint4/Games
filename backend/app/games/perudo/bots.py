"""Bots du Perudo et cadencement des manches.

Un bot ne connaît que ses dés et le nombre de dés des autres (la vue de son siège).
Il estime la chance qu'une enchère tienne : chaque dé inconnu montre la face voulue
avec une probabilité 1/3 (la face ou un Paco joker), 1/6 pour les Pacos ou en Palifico.
- Facile : conteste au jugé, surenchérit sur sa face la plus fréquente.
- Normal : le calcul, avec du bruit dans ses estimations.
- Difficile : le calcul exact, corrigé par ce que les enchères des autres trahissent
  de leurs dés ; il ne conteste que si c'est moins risqué que de surenchérir (une
  surenchère ne coûte un dé que si le suivant la conteste), et dit Calza quand le
  compte exact est nettement le plus probable. Il bat le Normal environ 2 fois sur 3.

Cadence : après chaque coup, `schedule` programme l'action du prochain bot, ou la
manche suivante quand les gobelets sont levés (REVEAL_DELAY, le temps que chacun
voie les dés). room.bot_token invalide ce qui était programmé dès qu'un coup survient.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from collections import Counter
from math import comb

from app.games.base import AfterMove
from app.games.perudo.engine import (
    PACO,
    GameError,
    GameStatus,
    Phase,
    add_player,
    bid,
    calza,
    count_matching,
    dudo,
    legal_bids,
    next_round,
    set_ready,
)
from app.rooms.manager import Room, Seat, manager
from app.rooms.views import room_view

logger = logging.getLogger(__name__)

DIFFICULTIES = {"easy": "Facile", "normal": "Normal", "hard": "Difficile"}

FIRST_NAMES = [
    "Pedro",
    "Lucía",
    "Mateo",
    "Valentina",
    "Diego",
    "Camila",
    "Javier",
    "Sofía",
    "Carlos",
    "Rosa",
    "Emilio",
    "Paloma",
    "Rafael",
    "Inés",
    "Tomás",
    "Marisol",
]
AVATAR_ANIMALS = [
    "renard",
    "panda",
    "grenouille",
    "chat",
    "lion",
    "pieuvre",
    "koala",
    "loup",
    "poussin",
    "tigre",
    "singe",
    "licorne",
    "requin",
    "hibou",
    "dino",
    "axolotl",
]

# Délais (secondes) : réfléchir à son enchère, se mettre prêt, laisser voir la révélation.
BID_DELAY = (1.4, 2.6)
LOBBY_DELAY = 0.8
REVEAL_DELAY = 12.0


def add_bot(room: Room, difficulty: str) -> Seat:
    """Assoit un bot en lobby (lève GameError si la table est pleine)."""
    taken = {s.pseudo for s in room.seats}
    free = [name for name in FIRST_NAMES if f"{name} bot" not in taken]
    pseudo = f"{random.choice(free)} bot" if free else f"Bot {len(room.seats) + 1}"
    add_player(room.state, pseudo)
    seat = Seat(
        player_id=uuid.uuid4(),
        pseudo=pseudo,
        avatar=f"{random.choice(AVATAR_ANIMALS)}-{random.randrange(6)}",
        bot=difficulty,
    )
    room.seats.append(seat)
    return seat


# ---------------------------------------------------------------------------
# Probabilités
# ---------------------------------------------------------------------------


def _p_at_least(n: int, p: float, k: int) -> float:
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


def _p_exact(n: int, p: float, k: int) -> float:
    if not 0 <= k <= n:
        return 0.0
    return comb(n, k) * p**k * (1 - p) ** (n - k)


# Crédit accordé à une enchère adverse : un joueur dont la dernière enchère portait sur
# une face a « montré » un dé de cette face avec cette probabilité (réglé par simulation).
SIGNAL_WEIGHT = 0.7


class _Estimate:
    """Ce que le bot sait : ses dés, le nombre de dés inconnus, les Pacos jokers ou non.
    `read_bids` : il tient compte de la dernière enchère de chaque adversaire."""

    def __init__(self, view: dict, read_bids: bool = False) -> None:
        self.dice: list[int] = view["your_dice"]
        self.unknown = view["total_dice"] - len(self.dice)
        self.wild = not view["palifico"]
        self.last_faces: dict[int, int] = {}
        if read_bids:
            for past in view["history"]:
                if past["player"] != view["your_seat"]:
                    self.last_faces[past["player"]] = past["face"]

    def _split(self, face: int) -> tuple[int, float]:
        mine = count_matching([self.dice], face, self.wild)
        p = 1 / 3 if self.wild and face != PACO else 1 / 6
        return mine, p

    def holds(self, quantity: int, face: int) -> float:
        mine, p = self._split(face)
        signals = min(sum(1 for f in self.last_faces.values() if f == face), self.unknown)
        # Chaque signal est un dé déjà acquis avec la probabilité SIGNAL_WEIGHT.
        w = SIGNAL_WEIGHT
        return sum(
            comb(signals, s)
            * w**s
            * (1 - w) ** (signals - s)
            * _p_at_least(self.unknown - s, p, quantity - mine - s)
            for s in range(signals + 1)
        )

    def exact(self, quantity: int, face: int) -> float:
        mine, p = self._split(face)
        return _p_exact(self.unknown, p, quantity - mine)


# ---------------------------------------------------------------------------
# Décisions
# ---------------------------------------------------------------------------

Decision = tuple[str, int, int]  # ("bid", quantité, face) | ("dudo", 0, 0) | ("calza", 0, 0)


def decide(view: dict, options: list[tuple[int, int]], difficulty: str) -> Decision:
    """`options` : les enchères permises (engine.legal_bids)."""
    est = _Estimate(view, read_bids=difficulty == "hard")
    current = view["bid"]
    if difficulty == "easy":
        return _decide_easy(view, est, options)
    if difficulty == "hard":
        return _decide_hard(est, current, options)

    def jitter(value: float) -> float:
        return value + random.gauss(0, 0.08)

    held = Counter(est.dice)
    if current is None:
        # Ouverture : sur la face la mieux tenue, la plus grosse quantité encore sûre à 60 %.
        solid = [(q, f) for q, f in options if jitter(est.holds(q, f)) >= 0.6]
        if not solid:
            return ("bid", *options[0])
        face = max(
            {f for _, f in solid}, key=lambda f: (count_matching([est.dice], f, est.wild), f)
        )
        return ("bid", max(q for q, f in solid if f == face), face)

    # Surenchère : parmi les enchères proches, la plus sûre ; à sûreté égale, la plus
    # modeste, de préférence sur une face qu'on a en main.
    ceiling = current["quantity"] + 3
    scored = [(jitter(est.holds(q, f)), q, f) for q, f in options if q <= ceiling]
    raise_p, q, f = 0.0, 0, 0
    if scored:
        best_p = max(s[0] for s in scored)
        near = [s for s in scored if s[0] >= best_p - 0.03]
        raise_p, q, f = min(near, key=lambda s: (s[1], -held[s[2]], -s[0]))
    doubt_p = jitter(1 - est.holds(current["quantity"], current["face"]))
    if doubt_p > raise_p or not scored:
        return ("dudo", 0, 0)
    return ("bid", q, f)


def _decide_hard(est: _Estimate, current: dict | None, options: list[tuple[int, int]]) -> Decision:
    held = Counter(est.dice)
    if current is None:
        solid = [(q, f) for q, f in options if est.holds(q, f) >= 0.6]
        if not solid:
            return ("bid", *options[0])
        face = max(
            {f for _, f in solid}, key=lambda f: (count_matching([est.dice], f, est.wild), f)
        )
        return ("bid", max(q for q, f in solid if f == face), face)
    scored = [(est.holds(q, f), q, f) for q, f in options if q <= current["quantity"] + 3]
    if not scored:
        return ("dudo", 0, 0)
    best_p = max(s[0] for s in scored)
    near = [s for s in scored if s[0] >= best_p - 0.03]
    raise_p, q, f = min(near, key=lambda s: (s[1], -held[s[2]], -s[0]))
    # Risques de perdre un dé : surenchère fausse ET contestée, contestation d'une
    # enchère vraie, Calza raté.
    risk_raise = (1 - raise_p) ** 2
    risk_dudo = est.holds(current["quantity"], current["face"])
    risk_calza = 1 - est.exact(current["quantity"], current["face"])
    if len(est.dice) < 5 and risk_calza + 0.1 < min(risk_raise, risk_dudo):
        return ("calza", 0, 0)
    if risk_dudo < risk_raise:
        return ("dudo", 0, 0)
    return ("bid", q, f)


def _decide_easy(view: dict, est: _Estimate, options: list[tuple[int, int]]) -> Decision:
    current = view["bid"]
    if current is not None:
        doubtful = est.holds(current["quantity"], current["face"]) < 0.3
        if not options or (doubtful and random.random() < 0.7) or random.random() < 0.08:
            return ("dudo", 0, 0)
    # Sa face la plus fréquente (hors Pacos), la quantité la plus basse permise.
    faces = [d for d in est.dice if d != PACO] or est.dice or [2]
    favourite = Counter(faces).most_common(1)[0][0]
    on_face = [o for o in options if o[1] == favourite]
    q, f = on_face[0] if on_face else options[0]
    return ("bid", q, f)


# ---------------------------------------------------------------------------
# Cadencement
# ---------------------------------------------------------------------------


def _plan(room: Room) -> tuple[str, int, float] | None:
    """(action, siège, délai) de ce qui doit se passer ensuite côté serveur, ou None."""
    state = room.state
    if state.status is GameStatus.LOBBY:
        for i, seat in enumerate(room.seats):
            if seat.bot and not state.players[i].ready:
                return "lobby", i, LOBBY_DELAY
        return None
    if state.status is not GameStatus.PLAYING:
        return None
    if state.phase is Phase.REVEAL:
        return "next_round", -1, REVEAL_DELAY
    turn = state.turn_index
    if not room.seats[turn].bot:
        return None
    return "play", turn, random.uniform(*BID_DELAY)


def schedule(room: Room, after_move: AfterMove) -> None:
    """À appeler sous room.lock après tout changement d'état de la table."""
    room.bot_token += 1
    plan = _plan(room)
    if plan is None:
        return
    asyncio.get_running_loop().create_task(_run(room, room.bot_token, plan, after_move))


async def _run(room: Room, token: int, plan: tuple[str, int, float], after_move: AfterMove) -> None:
    kind, seat, delay = plan
    await asyncio.sleep(delay)
    async with room.lock:
        if manager.get(room.code) is not room or room.bot_token != token:
            return
        try:
            events = _act(room, kind, seat)
        except GameError:
            logger.exception("Coup de bot impossible sur la table %s (%s)", room.code, kind)
            return
        await after_move(room, events)


def _act(room: Room, kind: str, seat: int) -> list[dict]:
    state = room.state
    if kind == "lobby":
        return set_ready(state, seat)
    if kind == "next_round":
        return next_round(state)
    difficulty = room.seats[seat].bot or "easy"
    action, quantity, face = decide(room_view(room, seat), legal_bids(state, seat), difficulty)
    if action == "dudo":
        return dudo(state, seat)
    if action == "calza":
        return calza(state, seat)
    return bid(state, seat, quantity, face)
