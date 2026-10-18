import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AppEvent(Base):
    """Une ligne du journal de l'app (voir app.journal). Trente jours, puis purgée."""

    __tablename__ = "app_events"
    __table_args__ = (
        # Le panneau lit « les plus récents d'un niveau », la fiche joueur « les siens ».
        Index("ix_app_events_level_id", "level", "id"),
        Index("ix_app_events_player_id_id", "player_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
        index=True,
    )
    # info / warning / error
    level: Mapped[str] = mapped_column(String(8))
    # Ce qui s'est passé, en un mot stable (game_finished, finish_refused, exception…).
    kind: Mapped[str] = mapped_column(String(40))
    game: Mapped[str | None] = mapped_column(String(20), default=None)
    # Le joueur concerné s'il est connu ; le pseudo tel qu'il était à ce moment-là.
    player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), default=None
    )
    pseudo: Mapped[str | None] = mapped_column(String(20), default=None)
    room: Mapped[str | None] = mapped_column(String(8), default=None)
    message: Mapped[str] = mapped_column(String(300))
    detail: Mapped[dict | None] = mapped_column(JSON, default=None)
    path: Mapped[str | None] = mapped_column(String(200), default=None)
    ip: Mapped[str | None] = mapped_column(String(64), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(200), default=None)
