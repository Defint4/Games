"""panneau d'administration : dernière visite, suspension, mot de passe admin, journal

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-24

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL partout : la dernière visite se remplit à la prochaine ouverture de l'app.
    op.add_column(
        "players", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "players", sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_table(
        "admin_credentials",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("session_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failures", sa.Integer(), server_default="0", nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("player_id"),
    )

    op.create_table(
        "admin_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("target", sa.String(length=40), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_admin_events_at"), "admin_events", ["at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_events_at"), table_name="admin_events")
    op.drop_table("admin_events")
    op.drop_table("admin_credentials")
    op.drop_column("players", "suspended_at")
    op.drop_column("players", "last_seen_at")
