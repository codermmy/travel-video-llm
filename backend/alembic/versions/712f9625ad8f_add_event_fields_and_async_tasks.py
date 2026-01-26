"""add_event_fields_and_async_tasks

Revision ID: 712f9625ad8f
Revises: 069f5dbaa8b3
Create Date: 2026-01-26 00:58:50.559812

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "712f9625ad8f"
down_revision: Union[str, Sequence[str], None] = "069f5dbaa8b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Events
    op.add_column(
        "events", sa.Column("location_name", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "events", sa.Column("gps_lat", sa.Numeric(precision=10, scale=7), nullable=True)
    )
    op.add_column(
        "events", sa.Column("gps_lon", sa.Numeric(precision=10, scale=7), nullable=True)
    )
    op.add_column(
        "events", sa.Column("start_time", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "events", sa.Column("end_time", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "events",
        sa.Column(
            "photo_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "events", sa.Column("cover_photo_id", sa.String(length=36), nullable=True)
    )
    op.add_column(
        "events", sa.Column("cover_photo_url", sa.String(length=500), nullable=True)
    )
    op.add_column("events", sa.Column("story_text", sa.Text(), nullable=True))
    op.add_column(
        "events", sa.Column("emotion_tag", sa.String(length=20), nullable=True)
    )
    op.add_column("events", sa.Column("music_id", sa.String(length=100), nullable=True))
    op.add_column(
        "events", sa.Column("music_url", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "events",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'clustered'"),
        ),
    )
    op.add_column(
        "events",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # Photos
    op.add_column(
        "photos",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # Async tasks
    op.create_table(
        "async_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=100), nullable=True),
        sa.Column("task_type", sa.String(length=50), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "progress", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("total", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_async_tasks_user_id"), "async_tasks", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_async_tasks_task_id"), "async_tasks", ["task_id"], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_async_tasks_task_id"), table_name="async_tasks")
    op.drop_index(op.f("ix_async_tasks_user_id"), table_name="async_tasks")
    op.drop_table("async_tasks")

    op.drop_column("photos", "updated_at")

    op.drop_column("events", "updated_at")
    op.drop_column("events", "status")
    op.drop_column("events", "music_url")
    op.drop_column("events", "music_id")
    op.drop_column("events", "emotion_tag")
    op.drop_column("events", "story_text")
    op.drop_column("events", "cover_photo_url")
    op.drop_column("events", "cover_photo_id")
    op.drop_column("events", "photo_count")
    op.drop_column("events", "end_time")
    op.drop_column("events", "start_time")
    op.drop_column("events", "gps_lon")
    op.drop_column("events", "gps_lat")
    op.drop_column("events", "location_name")
