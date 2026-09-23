"""Moteur de règles du Perudo — pur et server-authoritative.

Toutes les fonctions mutent un GameState et lèvent GameError (ou sous-classe) sur
coup illégal. Aucune I/O ici. Les fonctions d'action renvoient une liste
d'événements (dicts) pour les animations côté client.

Règles (docs/perudo/README.md), variantes retenues :
- 5 dés chacun, lancés en secret à chaque manche. Une enchère porte sur tous les dés
  de la table : « au moins N dés montrent telle face ». Les 1 (Pacos) sont jokers.
- Surenchère : plus de dés, ou autant sur une face plus haute. Vers les Pacos : moitié
  de la quantité arrondie au supérieur. Depuis les Pacos : double + 1. On n'ouvre pas
  sur les Pacos. Une enchère ne dépasse jamais le nombre de dés en jeu.
- Dudo (le joueur au trait seulement) : enchère tenue → le douteur perd un dé, sinon
  l'enchérisseur. Calza (tout joueur en jeu sauf l'enchérisseur, même hors de son
  tour) : compte exact → il regagne un dé (5 au plus), sinon il en perd un.
- Celui qui perd un dé ouvre la manche suivante ; après un Calza, c'est celui qui l'a
  dit. Éliminé : son voisin de gauche ouvre.
- Palifico : la première fois qu'un joueur tombe à 1 dé, la manche qu'il ouvre ensuite
  est Palifico : Pacos non jokers, ouverture sur n'importe quelle face (Pacos compris),
  puis la face ne change plus, seule la quantité monte — sauf pour les joueurs qui
  n'ont eux-mêmes qu'un dé, qui peuvent changer de face.
- Après un Dudo ou un Calza, la partie reste en phase REVEAL (tous les dés visibles)
  jusqu'à `next_round`, appelé par la plateforme après le temps de la révélation.
- Premier joueur de la partie : tiré au sort. Le tour passe dans le sens horaire.
"""

from __future__ import annotations

from math import ceil

from .errors import IllegalMove, InvalidAction, NotYourTurn
from .state import PACO, Bid, GameState, GameStatus, Phase, PlayerState, Reveal

MIN_PLAYERS = 2
MAX_PLAYERS = 6
START_DICE = 5
FACES = range(1, 7)

Event = dict


# ---------------------------------------------------------------------------
# Mise en place
# ---------------------------------------------------------------------------


def create_game(creator_name: str, seed: int | None = None) -> GameState:
    """Crée une partie en lobby avec son premier joueur."""
    state = GameState(players=[])
    if seed is not None:
        state.rng.seed(seed)
    add_player(state, creator_name)
    return state


def add_player(state: GameState, name: str) -> None:
    if state.status is not GameStatus.LOBBY:
        raise InvalidAction("La partie a déjà commencé.")
    if len(state.players) >= MAX_PLAYERS:
        raise InvalidAction("La partie est pleine.")
    if any(p.name == name for p in state.players):
        raise InvalidAction("Ce pseudo est déjà pris dans cette partie.")
    state.players.append(PlayerState(name=name))


def remove_player(state: GameState, player_index: int) -> None:
    if state.status is not GameStatus.LOBBY:
        raise InvalidAction("Impossible de quitter une partie en cours.")
    del state.players[player_index]


def set_ready(state: GameState, player_index: int, ready: bool = True) -> list[Event]:
    """Déclare un joueur prêt ; démarre quand tout le monde l'est."""
    if state.status is not GameStatus.LOBBY:
        raise InvalidAction("La partie a déjà commencé.")
    state.players[player_index].ready = ready
    if len(state.players) >= MIN_PLAYERS and all(p.ready for p in state.players):
        return _start(state)
    return []


def _start(state: GameState) -> list[Event]:
    for player in state.players:
        player.dice = [0] * START_DICE  # valeurs tirées par _new_round
        player.palifico_used = False
        player.finish_rank = None
    state.status = GameStatus.PLAYING
    state.eliminated = 0
    state.round_number = 0
    starter = state.rng.randrange(len(state.players))
    return [{"type": "game_started", "first_player": starter}, *_new_round(state, starter)]


def _new_round(state: GameState, starter: int) -> list[Event]:
    """Lance les dés de tous les joueurs en jeu ; `starter` ouvre les enchères."""
    state.round_number += 1
    state.phase = Phase.BIDDING
    state.bid = None
    state.history = []
    state.reveal = None
    state.turn_index = starter
    for player in state.players:
        if player.alive:
            player.dice = sorted(state.rng.randint(1, 6) for _ in player.dice)
    opener = state.players[starter]
    state.palifico = len(opener.dice) == 1 and not opener.palifico_used
    if state.palifico:
        opener.palifico_used = True
    return [
        {
            "type": "round_started",
            "round": state.round_number,
            "starter": starter,
            "palifico": state.palifico,
            "dice_counts": [len(p.dice) if p.alive else 0 for p in state.players],
        },
        {"type": "turn", "player": starter},
    ]


def next_round(state: GameState) -> list[Event]:
    """Fin de la révélation : nouvelle manche, ouverte par `next_starter`."""
    if state.status is not GameStatus.PLAYING or state.phase is not Phase.REVEAL:
        raise InvalidAction("Ce n'est pas le moment.")
    return _new_round(state, state.next_starter)


# ---------------------------------------------------------------------------
# Enchères
# ---------------------------------------------------------------------------


def count_matching(dice: list[list[int]], face: int, wild: bool) -> int:
    """Dés qui comptent pour `face` ; les Pacos s'ajoutent quand ils sont jokers."""
    return sum(
        1 for hand in dice for d in hand if d == face or (wild and d == PACO and face != PACO)
    )


def is_legal_bid(state: GameState, player_index: int, quantity: int, face: int) -> bool:
    """L'enchère (quantity, face) est-elle permise à ce joueur, sur l'enchère en cours ?"""
    if face not in FACES or not 1 <= quantity <= state.total_dice:
        return False
    previous = state.bid
    if previous is None:
        return state.palifico or face != PACO
    q0, f0 = previous.quantity, previous.face
    if state.palifico:
        if len(state.players[player_index].dice) == 1:
            return quantity > q0 or (quantity == q0 and face > f0)
        return face == f0 and quantity > q0
    if f0 != PACO and face != PACO:
        return quantity > q0 or (quantity == q0 and face > f0)
    if f0 != PACO:  # vers les Pacos
        return quantity >= ceil(q0 / 2)
    if face == PACO:
        return quantity > q0
    return quantity >= 2 * q0 + 1  # depuis les Pacos


def legal_bids(state: GameState, player_index: int) -> list[tuple[int, int]]:
    """Toutes les enchères permises, triées de la plus modeste à la plus haute quantité."""
    return [
        (q, f)
        for q in range(1, state.total_dice + 1)
        for f in FACES
        if is_legal_bid(state, player_index, q, f)
    ]


def bid(state: GameState, player_index: int, quantity: int, face: int) -> list[Event]:
    _check_turn(state, player_index)
    if not is_legal_bid(state, player_index, quantity, face):
        if state.bid is None and face == PACO and not state.palifico:
            raise IllegalMove("On n'ouvre pas sur les Pacos.")
        if state.palifico and state.bid is not None and face != state.bid.face:
            raise IllegalMove("En Palifico, la face ne change pas.")
        raise IllegalMove("Il faut surenchérir.")
    state.bid = Bid(quantity, face, player_index)
    state.history.append(state.bid)
    state.turn_index = _next_alive(state, player_index)
    return [
        {"type": "bid", "player": player_index, "quantity": quantity, "face": face},
        {"type": "turn", "player": state.turn_index},
    ]


# ---------------------------------------------------------------------------
# Dudo et Calza
# ---------------------------------------------------------------------------


def dudo(state: GameState, player_index: int) -> list[Event]:
    """Le joueur au trait conteste l'enchère en cours."""
    _check_turn(state, player_index)
    current = state.bid
    if current is None:
        raise InvalidAction("Pas d'enchère à contester.")
    count = _count(state, current.face)
    loser = player_index if count >= current.quantity else current.player
    return _resolve(state, "dudo", player_index, current, count, loser, -1)


def can_calza(state: GameState, player_index: int) -> bool:
    return (
        state.status is GameStatus.PLAYING
        and state.phase is Phase.BIDDING
        and state.bid is not None
        and state.bid.player != player_index
        and state.players[player_index].alive
    )


def calza(state: GameState, player_index: int) -> list[Event]:
    """N'importe quel joueur en jeu (sauf l'enchérisseur) annonce un compte exact."""
    if state.status is not GameStatus.PLAYING or state.phase is not Phase.BIDDING:
        raise InvalidAction("Ce n'est pas le moment.")
    current = state.bid
    if current is None:
        raise InvalidAction("Pas d'enchère à contester.")
    if current.player == player_index:
        raise InvalidAction("Impossible de dire Calza sur sa propre enchère.")
    if not state.players[player_index].alive:
        raise InvalidAction("Ce n'est pas le moment.")
    count = _count(state, current.face)
    delta = 1 if count == current.quantity else -1
    return _resolve(state, "calza", player_index, current, count, player_index, delta)


def _resolve(
    state: GameState, kind: str, caller: int, current: Bid, count: int, target: int, delta: int
) -> list[Event]:
    """Gobelets levés : on fige les dés pour la révélation, puis le dé change de main."""
    snapshot = [list(p.dice) if p.alive else [] for p in state.players]
    state.reveal = Reveal(kind, caller, current, snapshot, count, target, delta)
    state.phase = Phase.REVEAL
    events: list[Event] = [{"type": kind, **state.reveal.to_dict()}]
    player = state.players[target]
    if delta > 0:
        if len(player.dice) < START_DICE:
            player.dice.append(state.rng.randint(1, 6))
            events.append({"type": "die_gained", "player": target, "dice": len(player.dice)})
    else:
        player.dice.pop()
        events.append({"type": "die_lost", "player": target, "dice": len(player.dice)})
        if not player.dice:
            player.finish_rank = len(state.players) - state.eliminated
            state.eliminated += 1
            events.append({"type": "eliminated", "player": target, "rank": player.finish_rank})
    alive = state.alive_indices()
    if len(alive) == 1:
        state.players[alive[0]].finish_rank = 1
        state.status = GameStatus.FINISHED
        events.append({"type": "game_over", "winner": alive[0]})
        return events
    state.next_starter = target if state.players[target].alive else _next_alive(state, target)
    return events


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------


def _count(state: GameState, face: int) -> int:
    hands = [p.dice for p in state.players if p.alive]
    return count_matching(hands, face, wild=not state.palifico)


def _next_alive(state: GameState, index: int) -> int:
    n = len(state.players)
    for step in range(1, n + 1):
        candidate = (index + step) % n
        if state.players[candidate].alive:
            return candidate
    return index


def _check_turn(state: GameState, player_index: int) -> None:
    if state.status is not GameStatus.PLAYING or state.phase is not Phase.BIDDING:
        raise InvalidAction("Ce n'est pas le moment.")
    if state.turn_index != player_index:
        raise NotYourTurn("Ce n'est pas ton tour.")
