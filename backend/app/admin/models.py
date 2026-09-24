import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AdminCredential(Base):
    """Le compte administrateur et son mot de passe, posés sur le serveur par
    `python -m app.admin set-password <pseudo>`. L'admin est désigné par l'id du compte,
    jamais par son pseudo : un pseudo se renomme, et un autre pourrait le reprendre."""

    __tablename__ = "admin_credentials"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    password_hash: Mapped[str] = mapped_column(String(200))
    # Incrémentée à chaque nouveau mot de passe : les sessions admin ouvertes tombent.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AdminEvent(Base):
    """Journal du panneau : connexions (réussies ou non) et chaque action menée."""

    __tablename__ = "admin_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
        index=True,
    )
    action: Mapped[str] = mapped_column(String(40))
    # Ce sur quoi porte l'action, tel qu'il était à ce moment (pseudo, code de table).
    target: Mapped[str | None] = mapped_column(String(40), default=None)
    detail: Mapped[dict | None] = mapped_column(JSON, default=None)
    ip: Mapped[str | None] = mapped_column(String(64), default=None)
