"""add event story versioning fields

Revision ID: f1a2b3c4d5e6
Revises: d6e7f8a9b012
Create Date: 2026-04-01 18:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d6e7f8a9b012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("event_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "events",
        sa.Column("story_generated_from_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("story_requested_for_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column(
            "story_freshness",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'stale'"),
        ),
    )
    op.add_column(
        "events",
        sa.Column("slideshow_generated_from_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column(
            "slideshow_freshness",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'stale'"),
        ),
    )
    op.add_column(
        "events",
        sa.Column(
            "has_pending_structure_changes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "events",
        sa.Column(
            "title_manually_set",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.execute(
        """
        UPDATE events
        SET
            story_generated_from_version = CASE
                WHEN COALESCE(full_story, story_text) IS NOT NULL THEN event_version
                ELSE NULL
            END,
            story_requested_for_version = CASE
                WHEN status IN ('ai_pending', 'ai_processing') THEN event_version
                ELSE NULL
            END,
            story_freshness = CASE
                WHEN COALESCE(full_story, story_text) IS NOT NULL THEN 'fresh'
                ELSE 'stale'
            END,
            slideshow_generated_from_version = CASE
                WHEN COALESCE(full_story, story_text) IS NOT NULL THEN event_version
                ELSE NULL
            END,
            slideshow_freshness = CASE
                WHEN COALESCE(full_story, story_text) IS NOT NULL THEN 'fresh'
                ELSE 'stale'
            END,
            has_pending_structure_changes = CASE
                WHEN COALESCE(full_story, story_text) IS NOT NULL THEN false
                ELSE true
            END,
            title_manually_set = CASE
                WHEN COALESCE(TRIM(title), '') <> '' THEN true
                ELSE false
            END
        """
    )

    op.alter_column("events", "event_version", server_default=None)
    op.alter_column("events", "story_freshness", server_default=None)
    op.alter_column("events", "slideshow_freshness", server_default=None)
    op.alter_column("events", "has_pending_structure_changes", server_default=None)
    op.alter_column("events", "title_manually_set", server_default=None)


def downgrade() -> None:
    op.drop_column("events", "title_manually_set")
    op.drop_column("events", "has_pending_structure_changes")
    op.drop_column("events", "slideshow_freshness")
    op.drop_column("events", "slideshow_generated_from_version")
    op.drop_column("events", "story_freshness")
    op.drop_column("events", "story_requested_for_version")
    op.drop_column("events", "story_generated_from_version")
    op.drop_column("events", "event_version")
