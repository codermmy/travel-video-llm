"""add story layers and chapters

Revision ID: c4d5e6f7a8b9
Revises: b1f2a3c4d5e6
Create Date: 2026-02-09 23:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b1f2a3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("full_story", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("detailed_location", sa.String(length=200), nullable=True))
    op.add_column("events", sa.Column("location_tags", sa.String(length=500), nullable=True))

    op.add_column("photos", sa.Column("caption", sa.String(length=100), nullable=True))

    op.create_table(
        "event_chapters",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_index", sa.Integer(), nullable=False),
        sa.Column("chapter_title", sa.String(length=100), nullable=True),
        sa.Column("chapter_story", sa.Text(), nullable=True),
        sa.Column("slideshow_caption", sa.String(length=200), nullable=True),
        sa.Column("photo_start_index", sa.Integer(), nullable=False),
        sa.Column("photo_end_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_event_chapters_event_id"), "event_chapters", ["event_id"], unique=False)
    op.create_index(op.f("ix_event_chapters_user_id"), "event_chapters", ["user_id"], unique=False)
    op.create_index("idx_chapters_event", "event_chapters", ["event_id", "chapter_index"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_chapters_event", table_name="event_chapters")
    op.drop_index(op.f("ix_event_chapters_user_id"), table_name="event_chapters")
    op.drop_index(op.f("ix_event_chapters_event_id"), table_name="event_chapters")
    op.drop_table("event_chapters")

    op.drop_column("photos", "caption")

    op.drop_column("events", "location_tags")
    op.drop_column("events", "detailed_location")
    op.drop_column("events", "full_story")
