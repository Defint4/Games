"""solitaire : donnes servies, meilleur temps par jeu

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-24

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL partout : aucun jeu existant n'est chronométré.
    op.add_column("player_game_stats", sa.Column("best_ms", sa.Integer(), nullable=True))

    op.create_table(
        "solitaire_games",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("deck", sa.String(length=104), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("won", sa.Boolean(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("moves", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_solitaire_games_player_id"), "solitaire_games", ["player_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_solitaire_games_player_id"), table_name="solitaire_games")
    op.drop_table("solitaire_games")
    op.drop_column("player_game_stats", "best_ms")
