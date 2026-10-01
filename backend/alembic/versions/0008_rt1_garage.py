"""rt1 : garage (véhicules achetés et choisi), véhicule de chaque record

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-27

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Les pilotes existants n'ont que la citadine, et leurs records ont été faits avec.
    op.add_column(
        "rt1_profiles",
        sa.Column("vehicles", sa.JSON(), server_default=sa.text("'[\"starter\"]'"), nullable=False),
    )
    op.add_column(
        "rt1_profiles",
        sa.Column("vehicle", sa.String(length=20), server_default="starter", nullable=False),
    )
    op.add_column(
        "rt1_records",
        sa.Column("vehicle", sa.String(length=20), server_default="starter", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rt1_records", "vehicle")
    op.drop_column("rt1_profiles", "vehicle")
    op.drop_column("rt1_profiles", "vehicles")
