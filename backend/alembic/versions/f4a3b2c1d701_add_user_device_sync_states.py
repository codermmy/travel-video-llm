"""add user device sync states

Revision ID: f4a3b2c1d701
Revises: e3b2c4d5f601
Create Date: 2026-02-10 12:40:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a3b2c1d701"
down_revision: Union[str, Sequence[str], None] = "e3b2c4d5f601"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_device_sync_states",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("last_pull_cursor", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_pull_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_prompt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_id", name="uq_user_device_sync_state"),
    )
    op.create_index(
        op.f("ix_user_device_sync_states_device_id"),
        "user_device_sync_states",
        ["device_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_device_sync_states_user_id"),
        "user_device_sync_states",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "idx_user_device_sync_state_user_device",
        "user_device_sync_states",
        ["user_id", "device_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_user_device_sync_state_user_device", table_name="user_device_sync_states"
    )
    op.drop_index(
        op.f("ix_user_device_sync_states_user_id"), table_name="user_device_sync_states"
    )
    op.drop_index(
        op.f("ix_user_device_sync_states_device_id"),
        table_name="user_device_sync_states",
    )
    op.drop_table("user_device_sync_states")
