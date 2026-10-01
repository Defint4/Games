"""rt1 : progression des pilotes, records et fantômes par circuit

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-27

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rt1_profiles",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("money", sa.Integer(), server_default="0", nullable=False),
        sa.Column("xp", sa.Integer(), server_default="0", nullable=False),
        sa.Column("finishes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("missions", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("player_id"),
    )
    op.create_table(
        "rt1_records",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("circuit", sa.String(length=40), nullable=False),
        sa.Column("time_ms", sa.Integer(), nullable=False),
        sa.Column("splits", sa.JSON(), nullable=False),
        sa.Column("ghost", sa.LargeBinary(), nullable=True),
        sa.Column(
            "set_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("player_id", "circuit"),
    )
    op.create_index("ix_rt1_records_circuit_time", "rt1_records", ["circuit", "time_ms"])


def downgrade() -> None:
    op.drop_index("ix_rt1_records_circuit_time", table_name="rt1_records")
    op.drop_table("rt1_records")
    op.drop_table("rt1_profiles")
