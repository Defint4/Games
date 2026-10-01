"""rt1 : atelier (niveaux des pièces et réglages fins par véhicule)

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-27

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tous les véhicules existants sont d'origine.
    op.add_column(
        "rt1_profiles",
        sa.Column("workshop", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rt1_profiles", "workshop")
