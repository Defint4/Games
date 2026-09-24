"""index des stats par jeu : le classement d'un jeu ne parcourt plus toute la table

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-24

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # La clé primaire (player_id, game) ne sert pas à filtrer sur le seul jeu.
    op.create_index("ix_player_game_stats_game", "player_game_stats", ["game"])


def downgrade() -> None:
    op.drop_index("ix_player_game_stats_game", table_name="player_game_stats")
