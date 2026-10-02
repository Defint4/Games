"""solitaire : donnes gagnantes (option du joueur)

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-02

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Les donnes déjà servies étaient toutes tirées au hasard.
    op.add_column(
        "solitaire_games",
        sa.Column("winnable", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("solitaire_games", "winnable")
