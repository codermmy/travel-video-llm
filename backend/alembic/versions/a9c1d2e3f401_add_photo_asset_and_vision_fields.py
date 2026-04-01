"""add photo asset and vision fields

Revision ID: a9c1d2e3f401
Revises: f4a3b2c1d701
Create Date: 2026-03-31 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9c1d2e3f401"
down_revision: Union[str, Sequence[str], None] = "f4a3b2c1d701"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("asset_id", sa.String(length=255), nullable=True))
    op.add_column("photos", sa.Column("vision_result", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("photos", "vision_result")
    op.drop_column("photos", "asset_id")
