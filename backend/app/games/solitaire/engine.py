"""Le Klondike (pioche une carte, talon repassé sans limite), pour vérifier une partie.

Le joueur joue en local ; le serveur ne voit la partie qu'à la fin, sous forme de la
liste des coups, qu'il rejoue ici sur la donne qu'il a tirée. Le même moteur existe
côté client (frontend/src/games/solitaire/engine.ts) : les deux doivent rester
identiques, coup pour coup.

Cartes : rang (A23456789TJQK) + couleur (h d c s), « Th » = dix de cœur. Une donne est
la suite des 52 codes collés (104 caractères).

Coups :
- « d » : retourner la carte du talon sur la défausse ; talon vide, la défausse
  repasse en talon ;
- « <source>><cible> » ou « <source>><cible>:<n> » : déplacer la carte du dessus (ou
  les n du dessus d'une colonne). Piles : « w » défausse, « t0 »…« t6 » colonnes,
  « f0 »…« f3 » fondations.

La carte cachée découverte par un déplacement se retourne d'elle-même.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field

from app.games.base import GameError

RANKS = "A23456789TJQK"
SUITS = "hdcs"
RED = {"h", "d"}
COLUMNS = 7
FOUNDATIONS = 4
MAX_MOVES = 5000


def new_deck() -> str:
    """Un paquet battu au hasard pur (secrets), rien de choisi ni de filtré."""
    cards = [r + s for s in SUITS for r in RANKS]
    for i in range(len(cards) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        cards[i], cards[j] = cards[j], cards[i]
    return "".join(cards)


def parse_deck(deck: str) -> list[str]:
    cards = [deck[i : i + 2] for i in range(0, len(deck), 2)]
    if len(cards) != 52 or len(set(cards)) != 52:
        raise ValueError("Donne invalide.")
    return cards


def rank(card: str) -> int:
    return RANKS.index(card[0]) + 1


def red(card: str) -> bool:
    return card[1] in RED


@dataclass
class Klondike:
    # Colonnes : (carte, visible), du fond vers le dessus.
    tableau: list[list[tuple[str, bool]]] = field(default_factory=list)
    # Talon et défausse : le dessus est la fin de la liste.
    stock: list[str] = field(default_factory=list)
    waste: list[str] = field(default_factory=list)
    foundations: list[list[str]] = field(default_factory=list)

    @classmethod
    def deal(cls, deck: str) -> Klondike:
        """Distribution à la main, rangée par rangée : la colonne i reçoit i+1 cartes,
        la dernière face visible. Les 24 restantes font le talon."""
        cards = parse_deck(deck)
        tableau: list[list[tuple[str, bool]]] = [[] for _ in range(COLUMNS)]
        k = 0
        for row in range(COLUMNS):
            for col in range(row, COLUMNS):
                tableau[col].append((cards[k], row == col))
                k += 1
        return cls(
            tableau=tableau,
            stock=cards[k:],
            waste=[],
            foundations=[[] for _ in range(FOUNDATIONS)],
        )

    def won(self) -> bool:
        return all(len(f) == 13 for f in self.foundations)

    # --- Coups -----------------------------------------------------------------

    def play(self, move: str) -> None:
        if move == "d":
            self._draw()
            return
        try:
            src, rest = move.split(">", 1)
            dst, _, count = rest.partition(":")
            n = int(count) if count else 1
        except ValueError:
            raise GameError("Coup illisible.") from None
        # D'une pile vers elle-même, ou d'une fondation à l'autre : ce n'est pas un coup.
        if src == dst or (src[:1] == "f" and dst[:1] == "f"):
            raise GameError("Cette carte ne va pas là.")
        cards = self._take(src, n)
        self._put(dst, cards)
        self._pop(src, n)

    def _draw(self) -> None:
        if self.stock:
            self.waste.append(self.stock.pop())
        elif self.waste:
            self.stock = self.waste[::-1]
            self.waste = []
        else:
            raise GameError("Le talon est vide.")

    def _pile(self, name: str) -> tuple[str, int]:
        if name == "w":
            return "w", 0
        if len(name) == 2 and name[0] in "tf" and name[1].isdigit():
            index = int(name[1])
            if index < (COLUMNS if name[0] == "t" else FOUNDATIONS):
                return name[0], index
        raise GameError("Pile inconnue.")

    def _take(self, src: str, n: int) -> list[str]:
        """Les n cartes du dessus de la source, dans l'ordre (sans les retirer)."""
        kind, index = self._pile(src)
        if kind == "t":
            column = self.tableau[index]
            if n < 1 or n > len(column) or not all(up for _, up in column[-n:]):
                raise GameError("Ces cartes ne se déplacent pas.")
            return [card for card, _ in column[-n:]]
        pile = self.waste if kind == "w" else self.foundations[index]
        if n != 1 or not pile:
            raise GameError("Ces cartes ne se déplacent pas.")
        return [pile[-1]]

    def _put(self, dst: str, cards: list[str]) -> None:
        kind, index = self._pile(dst)
        first = cards[0]
        if kind == "f":
            pile = self.foundations[index]
            fits = len(cards) == 1 and (
                (not pile and rank(first) == 1)
                or (pile and pile[-1][1] == first[1] and rank(first) == rank(pile[-1]) + 1)
            )
            if not fits:
                raise GameError("Cette carte ne va pas là.")
            pile.append(first)
            return
        if kind != "t":
            raise GameError("Cette carte ne va pas là.")
        column = self.tableau[index]
        # Une suite déplacée est toujours alternée et descendante : elle n'a pu se
        # former qu'ainsi. On le revérifie quand même, le client n'est pas juge.
        for upper, lower in zip(cards, cards[1:], strict=False):
            if red(upper) == red(lower) or rank(lower) != rank(upper) - 1:
                raise GameError("Cette carte ne va pas là.")
        if column:
            top, up = column[-1]
            fits = up and red(top) != red(first) and rank(first) == rank(top) - 1
        else:
            fits = rank(first) == 13
        if not fits:
            raise GameError("Cette carte ne va pas là.")
        column.extend((card, True) for card in cards)

    def _pop(self, src: str, n: int) -> None:
        """Retire les cartes parties de la source ; retourne la carte découverte."""
        kind, index = self._pile(src)
        if kind == "t":
            column = self.tableau[index]
            del column[-n:]
            if column and not column[-1][1]:
                column[-1] = (column[-1][0], True)
        elif kind == "w":
            self.waste.pop()
        else:
            self.foundations[index].pop()


def replay(deck: str, moves: list[str]) -> Klondike:
    """Rejoue la partie coup par coup ; GameError au premier coup illégal."""
    if len(moves) > MAX_MOVES:
        raise GameError("Partie trop longue.")
    game = Klondike.deal(deck)
    for move in moves:
        game.play(move)
    return game
