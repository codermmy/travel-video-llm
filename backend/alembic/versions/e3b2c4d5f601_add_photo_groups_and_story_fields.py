"""add photo groups and story fields

Revision ID: e3b2c4d5f601
Revises: d2a1f8c4b001
Create Date: 2026-02-10 12:05:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3b2c4d5f601"
down_revision: Union[str, Sequence[str], None] = "d2a1f8c4b001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "event_chapters",
        sa.Column("chapter_intro", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "event_chapters",
        sa.Column("chapter_summary", sa.String(length=200), nullable=True),
    )

    op.add_column("photos", sa.Column("photo_index", sa.Integer(), nullable=True))
    op.add_column("photos", sa.Column("visual_desc", sa.Text(), nullable=True))
    op.add_column(
        "photos", sa.Column("micro_story", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "photos", sa.Column("emotion_tag", sa.String(length=20), nullable=True)
    )

    op.create_table(
        "photo_groups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("group_index", sa.Integer(), nullable=False),
        sa.Column("group_theme", sa.String(length=50), nullable=True),
        sa.Column("group_emotion", sa.String(length=20), nullable=True),
        sa.Column("group_scene_desc", sa.Text(), nullable=True),
        sa.Column("photo_start_index", sa.Integer(), nullable=False),
        sa.Column("photo_end_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["chapter_id"], ["event_chapters.id"]),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_photo_groups_chapter_id"), "photo_groups", ["chapter_id"], unique=False
    )
    op.create_index(
        op.f("ix_photo_groups_event_id"), "photo_groups", ["event_id"], unique=False
    )
    op.create_index(
        op.f("ix_photo_groups_user_id"), "photo_groups", ["user_id"], unique=False
    )
    op.create_index(
        "idx_photo_groups_chapter",
        "photo_groups",
        ["chapter_id", "group_index"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_photo_groups_chapter", table_name="photo_groups")
    op.drop_index(op.f("ix_photo_groups_user_id"), table_name="photo_groups")
    op.drop_index(op.f("ix_photo_groups_event_id"), table_name="photo_groups")
    op.drop_index(op.f("ix_photo_groups_chapter_id"), table_name="photo_groups")
    op.drop_table("photo_groups")

    op.drop_column("photos", "emotion_tag")
    op.drop_column("photos", "micro_story")
    op.drop_column("photos", "visual_desc")
    op.drop_column("photos", "photo_index")

    op.drop_column("event_chapters", "chapter_summary")
    op.drop_column("event_chapters", "chapter_intro")
