import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.mixins import IdMixin


class ChessGame(IdMixin, Base):
    """Une partie terminée, en ligne (classée) ou contre l'ordinateur (non classée).

    Les pseudos, avatars et cotes sont ceux du moment : la partie se relit telle qu'elle
    a été jouée. Côté ordinateur, l'identifiant est vide et `bot_elo` donne son niveau.
    """

    __tablename__ = "chess_games"

    white_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), index=True
    )
    black_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), index=True
    )
    white_pseudo: Mapped[str] = mapped_column(String(20))
    black_pseudo: Mapped[str] = mapped_column(String(20))
    white_avatar: Mapped[str] = mapped_column(String(40))
    black_avatar: Mapped[str] = mapped_column(String(40))
    # Cotes avant la partie et leur variation (vides pour une partie non classée).
    white_rating: Mapped[int | None] = mapped_column(Integer, default=None)
    black_rating: Mapped[int | None] = mapped_column(Integer, default=None)
    white_delta: Mapped[int | None] = mapped_column(Integer, default=None)
    black_delta: Mapped[int | None] = mapped_column(Integer, default=None)
    bot_elo: Mapped[int | None] = mapped_column(Integer, default=None)

    time_control: Mapped[str] = mapped_column(String(12))
    result: Mapped[str] = mapped_column(String(7))  # "1-0", "0-1", "1/2-1/2"
    termination: Mapped[str] = mapped_column(String(24))
    # Coups UCI séparés par des espaces, et temps restant (ms) après chacun.
    moves: Mapped[str] = mapped_column(Text)
    clocks: Mapped[list[int] | None] = mapped_column(JSON, default=None)
    # Bilan calculé sur l'appareil du premier qui l'ouvre, gardé pour les suivants.
    analysis: Mapped[dict | None] = mapped_column(JSON, default=None)

    ended_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
        index=True,
    )
