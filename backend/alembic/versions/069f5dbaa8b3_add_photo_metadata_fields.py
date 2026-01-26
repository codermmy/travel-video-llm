from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "069f5dbaa8b3"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("file_hash", sa.String(length=64), nullable=True))
    op.add_column("photos", sa.Column("gps_lat", sa.Numeric(10, 7), nullable=True))
    op.add_column("photos", sa.Column("gps_lon", sa.Numeric(10, 7), nullable=True))
    op.add_column(
        "photos", sa.Column("shoot_time", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "photos", sa.Column("thumbnail_path", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "photos", sa.Column("thumbnail_url", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "photos", sa.Column("local_path", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "photos",
        sa.Column(
            "status", sa.String(length=20), server_default="uploaded", nullable=False
        ),
    )
    op.add_column("photos", sa.Column("file_size", sa.Integer(), nullable=True))
    op.create_index(
        "idx_photos_user_hash", "photos", ["user_id", "file_hash"], unique=True
    )
    op.create_index("idx_photos_shoot_time", "photos", ["shoot_time"], unique=False)
    op.create_index("idx_photos_event", "photos", ["event_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_photos_event", table_name="photos")
    op.drop_index("idx_photos_shoot_time", table_name="photos")
    op.drop_index("idx_photos_user_hash", table_name="photos")
    op.drop_column("photos", "file_size")
    op.drop_column("photos", "status")
    op.drop_column("photos", "local_path")
    op.drop_column("photos", "thumbnail_url")
    op.drop_column("photos", "thumbnail_path")
    op.drop_column("photos", "shoot_time")
    op.drop_column("photos", "gps_lon")
    op.drop_column("photos", "gps_lat")
    op.drop_column("photos", "file_hash")
