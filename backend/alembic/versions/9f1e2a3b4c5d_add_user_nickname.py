"""add user nickname

Revision ID: 9f1e2a3b4c5d
Revises: 636083698910
Create Date: 2026-01-25 16:40:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9f1e2a3b4c5d"
down_revision: Union[str, Sequence[str], None] = "636083698910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "nickname")
