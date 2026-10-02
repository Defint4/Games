"""Le tri des donnes gagnantes : un solveur qui voit toutes les cartes.

Il ne sert qu'à l'option « Donne gagnante » : une donne n'est servie que si le solveur
l'a gagnée. Il peut renoncer à une donne gagnable (recherche bornée, coups rares écartés,
comme ramener une carte des fondations), jamais déclarer gagnable une donne qui ne l'est
pas : chacun de ses coups est un coup légal du jeu.

Pioche une carte, talon repassé sans limite : en piochant assez, n'importe quelle carte
du talon finit sur la défausse sans que l'ordre des autres change. Le talon est donc
traité comme un ensemble de cartes toutes jouables, ce qui réduit beaucoup la recherche.

Cartes en entiers : couleur * 13 + rang - 1 (couleurs h d c s, les deux premières rouges).
"""

from __future__ import annotations

from app.games.solitaire.engine import COLUMNS, RANKS, SUITS, new_deck, parse_deck

# Au-delà, la donne est abandonnée et une autre tirée. Mesuré : une donne gagnante sur
# 1,5 tirée, ~0,2 s en moyenne. Monter la limite gagne peu (79 % à 100 000) et coûte des
# secondes sur les donnes perdues.
NODE_LIMIT = 5_000
MAX_DEALS = 40

Column = tuple[tuple[int, ...], tuple[int, ...]]  # (cachées, visibles), du fond au dessus
State = tuple[tuple[Column, ...], tuple[int, ...], frozenset[int]]  # colonnes, fondations, talon


class NoWinnableDeal(Exception):
    pass


def _rank(card: int) -> int:
    return card % 13 + 1


def _suit(card: int) -> int:
    return card // 13


def _red(card: int) -> bool:
    return card < 26


def _on(card: int, top: int) -> bool:
    """La carte se pose sur `top` en colonne."""
    return _red(card) != _red(top) and _rank(card) == _rank(top) - 1


def _start(deck: str) -> State:
    cards = [SUITS.index(c[1]) * 13 + RANKS.index(c[0]) for c in parse_deck(deck)]
    hidden: list[list[int]] = [[] for _ in range(COLUMNS)]
    up: list[int] = [0] * COLUMNS
    k = 0
    for row in range(COLUMNS):
        for col in range(row, COLUMNS):
            if row == col:
                up[col] = cards[k]
            else:
                hidden[col].append(cards[k])
            k += 1
    columns = tuple((tuple(hidden[c]), (up[c],)) for c in range(COLUMNS))
    return columns, (0, 0, 0, 0), frozenset(cards[k:])


def _settle(columns: list[Column], foundations: list[int], talon: set[int]) -> State:
    """Retourne les cartes découvertes, monte les cartes sans risque, et range les
    colonnes (leur ordre ne compte pas) pour reconnaître une position déjà vue."""
    moved = True
    while moved:
        moved = False
        for i, (hidden, up) in enumerate(columns):
            if not up and hidden:
                columns[i] = (hidden[:-1], (hidden[-1],))
        # Sans risque : plus aucune carte de la couleur opposée ne peut venir s'y poser.
        for i, (hidden, up) in enumerate(columns):
            if up and _safe(up[-1], foundations):
                foundations[_suit(up[-1])] += 1
                columns[i] = (hidden, up[:-1])
                moved = True
        for card in list(talon):
            if _safe(card, foundations):
                foundations[_suit(card)] += 1
                talon.discard(card)
                moved = True
    return tuple(sorted(columns)), tuple(foundations), frozenset(talon)


def _safe(card: int, foundations: list[int]) -> bool:
    rank = _rank(card)
    if foundations[_suit(card)] != rank - 1:
        return False
    opposite = (2, 3) if _red(card) else (0, 1)
    return rank <= 2 or all(foundations[s] >= rank - 1 for s in opposite)


def _children(state: State) -> list[State]:
    """Les positions suivantes, des moins prometteuses aux plus prometteuses (la
    recherche dépile la dernière en premier)."""
    columns, foundations, talon = state
    weak: list[State] = []
    strong: list[State] = []

    tops = [up[-1] if up else None for _, up in columns]
    empty = [i for i, (h, u) in enumerate(columns) if not h and not u]

    # Vers les fondations.
    for i, (hidden, up) in enumerate(columns):
        if up and foundations[_suit(up[-1])] == _rank(up[-1]) - 1:
            cols, found = list(columns), list(foundations)
            found[_suit(up[-1])] += 1
            cols[i] = (hidden, up[:-1])
            (strong if len(up) == 1 and hidden else weak).append(_settle(cols, found, set(talon)))
    for card in talon:
        if foundations[_suit(card)] == _rank(card) - 1:
            found = list(foundations)
            found[_suit(card)] += 1
            weak.append(_settle(list(columns), found, set(talon) - {card}))

    # Du talon vers les colonnes.
    for card in talon:
        for j, top in enumerate(tops):
            if top is not None and _on(card, top):
                cols = list(columns)
                cols[j] = (cols[j][0], cols[j][1] + (card,))
                weak.append(_settle(cols, list(foundations), set(talon) - {card}))
        if _rank(card) == 13 and empty:
            cols = list(columns)
            cols[empty[0]] = ((), (card,))
            weak.append(_settle(cols, list(foundations), set(talon) - {card}))

    # D'une colonne à l'autre.
    for i, (hidden, up) in enumerate(columns):
        for start in range(len(up)):
            moving = up[start:]
            whole = start == 0
            # Une partie seulement de la suite : utile si la carte libérée monte ensuite.
            if not whole and foundations[_suit(up[start - 1])] != _rank(up[start - 1]) - 1:
                continue
            # Toute la suite d'une colonne sans carte cachée : utile pour la vider, sauf
            # un roi qui ne ferait que changer de colonne vide.
            for j, top in enumerate(tops):
                if j == i:
                    continue
                if top is None:
                    if j != (empty[0] if empty else -1) or _rank(moving[0]) != 13:
                        continue
                    if whole and not hidden:
                        continue
                elif not _on(moving[0], top):
                    continue
                cols = list(columns)
                cols[j] = (cols[j][0], cols[j][1] + moving)
                cols[i] = (hidden, up[:start])
                (strong if whole and hidden else weak).append(
                    _settle(cols, list(foundations), set(talon))
                )
    return weak + strong


def solvable(deck: str, limit: int = NODE_LIMIT) -> bool:
    """La donne est-elle gagnée par le solveur en moins de `limit` positions ?"""
    columns, foundations, talon = _start(deck)
    stack = [_settle(list(columns), list(foundations), set(talon))]
    seen: set[State] = set()
    while stack:
        state = stack.pop()
        if state in seen:
            continue
        if all(f == 13 for f in state[1]):
            return True
        seen.add(state)
        if len(seen) > limit:
            return False
        stack.extend(_children(state))
    return False


def winnable_deck() -> str:
    """Un paquet battu au hasard, retenu seulement si le solveur gagne la donne."""
    for _ in range(MAX_DEALS):
        deck = new_deck()
        if solvable(deck):
            return deck
    raise NoWinnableDeal
