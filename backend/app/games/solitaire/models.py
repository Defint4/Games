import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.mixins import IdMixin


class SolitaireGame(IdMixin, Base):
    """Une donne servie à un joueur. Ouverte tant que `finished_at` est vide : un joueur
    n'en a qu'une à la fois, la suivante compte la précédente perdue."""

    __tablename__ = "solitaire_games"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
    deck: Mapped[str] = mapped_column(String(104))
    # Le chrono est celui du serveur : de la donne servie à la victoire reçue.
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(UTC)
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    won: Mapped[bool | None] = mapped_column(Boolean, default=None)
    duration_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    moves: Mapped[int | None] = mapped_column(Integer, default=None)
