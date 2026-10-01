import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Rt1Profile(Base):
    """La progression d'un pilote : créée à sa première course finie."""

    __tablename__ = "rt1_profiles"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    money: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    finishes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Identifiants des missions accomplies (payées), voir rules.MISSIONS.
    missions: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Véhicules achetés (la citadine d'office) et celui qui roule.
    vehicles: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["starter"])
    vehicle: Mapped[str] = mapped_column(String(20), default="starter", server_default="starter")
    # L'atelier par véhicule : {"levels": {pièce: niveau}, "tune": {réglage: -1…1},
    # "livery": peinture, jantes, vitres, numéro, logo (voir router.Livery)}.
    workshop: Mapped[dict] = mapped_column(JSON, default=dict)


class Rt1Record(Base):
    """Le meilleur temps d'un pilote sur un circuit, ses temps de passage et son fantôme."""

    __tablename__ = "rt1_records"
    # Classement d'un circuit : les temps dans l'ordre sans parcourir la table.
    __table_args__ = (Index("ix_rt1_records_circuit_time", "circuit", "time_ms"),)

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    circuit: Mapped[str] = mapped_column(String(40), primary_key=True)
    time_ms: Mapped[int] = mapped_column(Integer)
    # Le véhicule du record (celui que montre le fantôme).
    vehicle: Mapped[str] = mapped_column(String(20), default="starter", server_default="starter")
    # Temps de passage (ms) à chaque checkpoint puis à l'arrivée.
    splits: Mapped[list[int]] = mapped_column(JSON)
    # Poses 20 fois par seconde, Float32 petit-boutiste (frontend sim/ghost.ts).
    ghost: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(UTC)
    )
