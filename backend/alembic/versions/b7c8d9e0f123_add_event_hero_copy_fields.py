"""add event hero copy fields

Revision ID: b7c8d9e0f123
Revises: ab4c5d6e7f89
Create Date: 2026-04-06 19:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f123"
down_revision: Union[str, Sequence[str], None] = "ab4c5d6e7f89"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("hero_title", sa.String(length=120), nullable=True))
    op.add_column("events", sa.Column("hero_summary", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "hero_summary")
    op.drop_column("events", "hero_title")
