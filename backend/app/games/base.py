"""Contrat entre la plateforme (tables, sièges, WebSocket, stats) et un jeu.

Un jeu est un dossier `app/games/<slug>/` qui expose une sous-classe de GameSpec :
la plateforme ne connaît rien d'autre. Elle possède la table (Room), les sièges,
le chat, le timer de tour, la revanche et les stats ; le jeu possède son état
(opaque pour la plateforme), ses règles, ses vues filtrées et ses bots.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.rooms.manager import Room, Seat

Event = dict
AfterMove = Callable[["Room", list[Event]], Awaitable[None]]


class GameStatus(StrEnum):
    """Phases communes à tous les jeux : la plateforme s'en sert pour gérer la table."""

    LOBBY = "lobby"
    PLAYING = "playing"
    FINISHED = "finished"


class GameError(Exception):
    """Erreur de règle ou d'action invalide : renvoyée telle quelle au client."""


class GameSpec(ABC):
    """Ce qu'un jeu doit fournir pour être servi par la plateforme.

    Toutes les méthodes sont appelées sous `room.lock`. L'état renvoyé par
    `create_state` est stocké dans `room.state` sans être inspecté ; `room.data`
    reçoit ce que renvoie `new_room_data` (compteurs, mémoire de bots...).
    """

    slug: str  # identifiant d'URL et de stats, stable : "nine-to-one"
    name: str
    min_players: int
    max_players: int
    # Difficultés de bots proposées (id → libellé) ; vide = pas de bots.
    bot_difficulties: dict[str, str] = {}
    # Joueur déconnecté à son tour : son coup part d'office au bout de ce délai (s).
    absent_seconds: int = 120
    # Jeu classé à l'Elo : cote de départ d'un joueur (None = jeu non classé).
    initial_rating: int | None = None
    # Vrai : la revanche attend que tous les humains la demandent (échecs) ; faux : le
    # premier qui la demande emmène toute la table.
    rematch_consent: bool = False

    # --- Cycle de vie de l'état ----------------------------------------------

    @abstractmethod
    def create_state(self, creator_pseudo: str) -> Any:
        """Nouvelle partie en lobby, le créateur déjà assis en siège 0."""

    @abstractmethod
    def add_player(self, state: Any, pseudo: str) -> None:
        """Assoit un joueur en lobby (lève GameError si impossible)."""

    @abstractmethod
    def remove_player(self, state: Any, seat: int) -> None:
        """Libère un siège en lobby."""

    @abstractmethod
    def rotate_players(self, state: Any, k: int) -> None:
        """Décale les joueurs de k positions (le siège k devient le siège 0)."""

    @abstractmethod
    def status(self, state: Any) -> GameStatus: ...

    @abstractmethod
    def current_turn(self, state: Any) -> int | None:
        """Siège dont c'est le tour, None hors partie."""

    def configure(self, state: Any, options: dict) -> None:
        """Options choisies à la création de la table (la cadence aux échecs). Lève
        GameError si elles sont invalides. Aucune par défaut."""
        return None

    def rematch_options(self, room: Room) -> dict:
        """Options de la table de revanche (mêmes réglages, couleurs inversées...)."""
        return {}

    def summary(self, room: Room) -> dict:
        """Ce que la liste des tables ouvertes montre en plus des joueurs."""
        return {}

    def lobby_changed(self, state: Any) -> list[Event]:
        """Un siège de lobby vient d'être libéré : si tous les joueurs restants sont
        prêts (et assez nombreux), la partie démarre. Rien par défaut."""
        return []

    def new_room_data(self) -> Any:
        """Données propres au jeu pour la table (None par défaut)."""
        return None

    # --- Vue et actions --------------------------------------------------------

    @abstractmethod
    def view(self, room: Room, seat: int) -> dict:
        """Ce que le joueur du siège voit. Peut contenir une clé `players` : une
        liste de dicts (un par siège) fusionnée dans les fiches joueurs communes."""

    @abstractmethod
    def handle_action(
        self, room: Room, seat: int, action: str, message: dict
    ) -> list[Event] | None:
        """Applique une action de jeu et renvoie les événements produits.
        None = action inconnue du jeu. Lève GameError sur coup illégal ;
        KeyError/TypeError/ValueError = message mal formé."""

    @abstractmethod
    def auto_play(self, room: Room, seat: int) -> list[Event]:
        """Temps de tour écoulé : le coup le plus simple pour ce siège."""

    # --- Fin de partie -----------------------------------------------------------

    @abstractmethod
    def results(self, room: Room) -> tuple[int, int] | None:
        """(siège gagnant, siège perdant) d'une partie terminée, None si sans objet."""

    async def record_results(self, room: Room, db: AsyncSession) -> bool:
        """Bilan de fin de partie propre au jeu (Elo, historique des parties). Faux =
        le bilan commun (un gagnant, un perdant, selon `results`) s'applique."""
        return False

    # Crochets optionnels (rien par défaut, d'où les `return None` explicites).

    def on_events(self, room: Room, events: list[Event]) -> None:
        """Après chaque coup, avec les événements diffusés (compteurs, mémoire des bots)."""
        return None

    def on_game_over(self, room: Room) -> None:
        """Une fois les stats enregistrées (journalisation, etc.)."""
        return None

    # --- Bots --------------------------------------------------------------------

    def add_bot(self, room: Room, difficulty: str) -> Seat:
        raise GameError("Ce jeu n'a pas de bots.")

    def schedule_bots(self, room: Room, after_move: AfterMove) -> None:
        """Programme l'action du prochain bot, s'il y en a un à faire agir."""
        return None
