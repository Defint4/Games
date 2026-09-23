"""code PIN des joueurs

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pin_hash NULL : les comptes existants gardent le code par défaut (0000).
    op.add_column("players", sa.Column("pin_hash", sa.String(length=200), nullable=True))
    op.add_column(
        "players",
        sa.Column("pin_failures", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "players", sa.Column("pin_locked_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "players",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("players", "token_version")
    op.drop_column("players", "pin_locked_until")
    op.drop_column("players", "pin_failures")
    op.drop_column("players", "pin_hash")
