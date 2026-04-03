"""add photo dimensions

Revision ID: ab4c5d6e7f89
Revises: f1a2b3c4d5e6
Create Date: 2026-04-03 11:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ab4c5d6e7f89"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("photos", sa.Column("height", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("photos", "height")
    op.drop_column("photos", "width")
