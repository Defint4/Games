"""échecs : cote Elo par jeu, parties terminées

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-24

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL partout : aucun jeu existant n'est classé à l'Elo.
    op.add_column("player_game_stats", sa.Column("rating", sa.Integer(), nullable=True))

    op.create_table(
        "chess_games",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("white_id", sa.UUID(), nullable=True),
        sa.Column("black_id", sa.UUID(), nullable=True),
        sa.Column("white_pseudo", sa.String(length=20), nullable=False),
        sa.Column("black_pseudo", sa.String(length=20), nullable=False),
        sa.Column("white_avatar", sa.String(length=40), nullable=False),
        sa.Column("black_avatar", sa.String(length=40), nullable=False),
        sa.Column("white_rating", sa.Integer(), nullable=True),
        sa.Column("black_rating", sa.Integer(), nullable=True),
        sa.Column("white_delta", sa.Integer(), nullable=True),
        sa.Column("black_delta", sa.Integer(), nullable=True),
        sa.Column("bot_elo", sa.Integer(), nullable=True),
        sa.Column("time_control", sa.String(length=12), nullable=False),
        sa.Column("result", sa.String(length=7), nullable=False),
        sa.Column("termination", sa.String(length=24), nullable=False),
        sa.Column("moves", sa.Text(), nullable=False),
        sa.Column("clocks", sa.JSON(), nullable=True),
        sa.Column("analysis", sa.JSON(), nullable=True),
        sa.Column(
            "ended_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["white_id"], ["players.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["black_id"], ["players.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chess_games_white_id"), "chess_games", ["white_id"], unique=False)
    op.create_index(op.f("ix_chess_games_black_id"), "chess_games", ["black_id"], unique=False)
    op.create_index(op.f("ix_chess_games_ended_at"), "chess_games", ["ended_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_chess_games_ended_at"), table_name="chess_games")
    op.drop_index(op.f("ix_chess_games_black_id"), table_name="chess_games")
    op.drop_index(op.f("ix_chess_games_white_id"), table_name="chess_games")
    op.drop_table("chess_games")
    op.drop_column("player_game_stats", "rating")
