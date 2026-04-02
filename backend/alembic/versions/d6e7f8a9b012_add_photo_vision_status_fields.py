"""add photo vision status fields

Revision ID: d6e7f8a9b012
Revises: c1d2e3f4a501
Create Date: 2026-04-01 15:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b012"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a501"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "photos",
        sa.Column("vision_status", sa.String(length=20), nullable=False, server_default="pending"),
    )
    op.add_column("photos", sa.Column("vision_error", sa.Text(), nullable=True))
    op.add_column("photos", sa.Column("vision_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("photos", "vision_status", server_default=None)


def downgrade() -> None:
    op.drop_column("photos", "vision_updated_at")
    op.drop_column("photos", "vision_error")
    op.drop_column("photos", "vision_status")
