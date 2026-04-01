"""add event enhancement assets

Revision ID: c1d2e3f4a501
Revises: a9c1d2e3f401
Create Date: 2026-04-01 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a501"
down_revision: Union[str, Sequence[str], None] = "a9c1d2e3f401"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_enhancement_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("photo_id", sa.String(length=36), nullable=True),
        sa.Column("local_path", sa.String(length=500), nullable=False),
        sa.Column("public_url", sa.String(length=500), nullable=True),
        sa.Column("storage_provider", sa.String(length=20), nullable=True),
        sa.Column("object_key", sa.String(length=500), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("analysis_result", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_event_enhancement_assets_event_id",
        "event_enhancement_assets",
        ["event_id"],
        unique=False,
    )
    op.create_index(
        "ix_event_enhancement_assets_expires_at",
        "event_enhancement_assets",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_event_enhancement_assets_user_id",
        "event_enhancement_assets",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_event_enhancement_assets_user_id", table_name="event_enhancement_assets")
    op.drop_index("ix_event_enhancement_assets_expires_at", table_name="event_enhancement_assets")
    op.drop_index("ix_event_enhancement_assets_event_id", table_name="event_enhancement_assets")
    op.drop_table("event_enhancement_assets")
