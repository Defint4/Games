"""État d'une partie de Perudo.

Structures pures (aucune I/O) : le moteur (game.py) les fait évoluer, la couche
réseau filtre ce que chaque joueur a le droit de voir (ses propres dés seulement,
tous les dés au moment de la révélation).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import StrEnum

from app.games.base import GameStatus

__all__ = ["Bid", "GameState", "GameStatus", "Phase", "PlayerState", "Reveal"]

PACO = 1  # les 1, jokers hors Palifico


class Phase(StrEnum):
    BIDDING = "bidding"  # enchères en cours
    REVEAL = "reveal"  # gobelets levés après un Dudo ou un Calza, avant la manche suivante


@dataclass(slots=True, frozen=True)
class Bid:
    quantity: int
    face: int
    player: int  # siège de l'enchérisseur

    def to_dict(self) -> dict:
        return {"quantity": self.quantity, "face": self.face, "player": self.player}


@dataclass(slots=True)
class Reveal:
    """Ce qu'on voit gobelets levés : tous les dés, le compte et l'issue."""

    kind: str  # "dudo" | "calza"
    caller: int
    bid: Bid
    dice: list[list[int]]  # dés de chaque siège au moment de la révélation
    count: int
    # Siège qui perd (ou gagne, Calza réussi) un dé, et le sens : -1 ou +1.
    target: int
    delta: int

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "caller": self.caller,
            "bid": self.bid.to_dict(),
            "dice": [list(d) for d in self.dice],
            "count": self.count,
            "target": self.target,
            "delta": self.delta,
        }


@dataclass(slots=True)
class PlayerState:
    name: str
    dice: list[int] = field(default_factory=list)  # nombre de dés = len(dice)
    ready: bool = False
    # Le Palifico ne se joue qu'une fois : la première fois qu'on tombe à 1 dé.
    palifico_used: bool = False
    # None = en jeu ; sinon rang final (1 = vainqueur, n = premier éliminé).
    finish_rank: int | None = None

    @property
    def alive(self) -> bool:
        return self.finish_rank is None


@dataclass(slots=True)
class GameState:
    players: list[PlayerState]
    status: GameStatus = GameStatus.LOBBY
    phase: Phase = Phase.BIDDING
    turn_index: int = 0
    round_number: int = 0
    bid: Bid | None = None
    # Enchères de la manche, dans l'ordre : publiques, tout le monde les a entendues.
    history: list[Bid] = field(default_factory=list)
    # Manche Palifico : Pacos non jokers, face bloquée (sauf joueurs à 1 dé).
    palifico: bool = False
    reveal: Reveal | None = None
    # Qui ouvrira la manche suivante (fixé à la révélation).
    next_starter: int = 0
    eliminated: int = 0
    rng: random.Random = field(default_factory=random.Random)

    def alive_indices(self) -> list[int]:
        return [i for i, p in enumerate(self.players) if p.alive]

    @property
    def total_dice(self) -> int:
        return sum(len(p.dice) for p in self.players if p.alive)
