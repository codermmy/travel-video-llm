"""add auth verification fields

Revision ID: b1f2a3c4d5e6
Revises: 8d7b1f2a9c10
Create Date: 2026-02-09 23:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1f2a3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "8d7b1f2a9c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("verification_code", sa.String(length=6), nullable=True))
    op.add_column(
        "users", sa.Column("verification_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("reset_code", sa.String(length=6), nullable=True))
    op.add_column(
        "users", sa.Column("reset_code_expires_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "reset_code_expires_at")
    op.drop_column("users", "reset_code")
    op.drop_column("users", "verification_expires_at")
    op.drop_column("users", "verification_code")
    op.drop_column("users", "email_verified")
