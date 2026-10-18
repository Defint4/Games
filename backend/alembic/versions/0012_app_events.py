"""journal de l'app : table app_events

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-18

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("level", sa.String(length=8), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("game", sa.String(length=20), nullable=True),
        sa.Column("player_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pseudo", sa.String(length=20), nullable=True),
        sa.Column("room", sa.String(length=8), nullable=True),
        sa.Column("message", sa.String(length=300), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("path", sa.String(length=200), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_app_events_at", "app_events", ["at"])
    op.create_index("ix_app_events_level_id", "app_events", ["level", "id"])
    op.create_index("ix_app_events_player_id_id", "app_events", ["player_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_app_events_player_id_id", table_name="app_events")
    op.drop_index("ix_app_events_level_id", table_name="app_events")
    op.drop_index("ix_app_events_at", table_name="app_events")
    op.drop_table("app_events")
