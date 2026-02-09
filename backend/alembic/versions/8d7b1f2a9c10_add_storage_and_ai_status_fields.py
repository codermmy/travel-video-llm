"""add_storage_and_ai_status_fields

Revision ID: 8d7b1f2a9c10
Revises: 712f9625ad8f
Create Date: 2026-02-09 12:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d7b1f2a9c10'
down_revision: Union[str, Sequence[str], None] = '712f9625ad8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('photos', sa.Column('storage_provider', sa.String(length=20), nullable=True))
    op.add_column('photos', sa.Column('object_key', sa.String(length=500), nullable=True))

    op.add_column('events', sa.Column('ai_error', sa.Text(), nullable=True))

    op.add_column(
        'async_tasks',
        sa.Column('stage', sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
    )


def downgrade() -> None:
    op.drop_column('async_tasks', 'stage')
    op.drop_column('events', 'ai_error')
    op.drop_column('photos', 'object_key')
    op.drop_column('photos', 'storage_provider')
