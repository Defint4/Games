"""rt1 : tickets de départ (une arrivée par course lancée, datée par le serveur)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-01

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rt1_races",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("circuit", sa.String(40), nullable=False),
        sa.Column("vehicle", sa.String(20), nullable=False),
        sa.Column("bots_level", sa.String(10), nullable=True),
        sa.Column("bots_count", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
    )
    op.create_index("ix_rt1_races_player_started", "rt1_races", ["player_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_rt1_races_player_started", table_name="rt1_races")
    op.drop_table("rt1_races")
