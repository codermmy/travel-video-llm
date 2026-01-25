"""add email password auth

Revision ID: a1b2c3d4e5f6
Revises: 9f1e2a3b4c5d
Create Date: 2026-01-25 17:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9f1e2a3b4c5d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """升级数据库架构，添加邮箱密码认证支持。"""

    # 获取数据库连接信息
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        # SQLite 需要重建表来修改约束
        # 1. 创建新表
        op.execute("""
            CREATE TABLE users_new (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                device_id VARCHAR(128) UNIQUE,
                email VARCHAR(255) UNIQUE,
                hashed_password VARCHAR(255),
                auth_type VARCHAR(50) NOT NULL DEFAULT 'device',
                nickname VARCHAR(64),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 2. 创建索引
        op.execute("CREATE INDEX ix_users_new_device_id ON users_new(device_id)")
        op.execute("CREATE INDEX ix_users_new_email ON users_new(email)")

        # 3. 复制数据
        op.execute("""
            INSERT INTO users_new (id, device_id, nickname, created_at, auth_type)
            SELECT id, device_id, nickname, created_at, 'device' FROM users
        """)

        # 4. 删除旧表
        op.execute("DROP TABLE users")

        # 5. 重命名新表
        op.execute("ALTER TABLE users_new RENAME TO users")

        # 6. 重建索引
        op.execute("CREATE INDEX ix_users_device_id ON users(device_id)")
        op.execute("CREATE INDEX ix_users_email ON users(email)")
    else:
        # PostgreSQL 等支持 ALTER COLUMN 的数据库
        # Step 1: 添加新字段（允许 NULL，不影响现有数据）
        op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
        op.add_column("users", sa.Column("hashed_password", sa.String(length=255), nullable=True))
        op.add_column(
            "users",
            sa.Column("auth_type", sa.String(length=50), nullable=False, server_default="device"),
        )

        # Step 2: 为现有用户设置 auth_type
        op.execute("UPDATE users SET auth_type = 'device' WHERE auth_type IS NULL")

        # Step 3: 创建邮箱唯一索引
        op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

        # Step 4: 修改 device_id 为可选
        op.alter_column("users", "device_id", nullable=True)


def downgrade() -> None:
    """回滚数据库架构变更。"""
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        # SQLite 需要重建表来回滚
        op.execute("""
            CREATE TABLE users_new (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                device_id VARCHAR(128) NOT NULL UNIQUE,
                nickname VARCHAR(64),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        op.execute("CREATE INDEX ix_users_new_device_id ON users_new(device_id)")

        # 只复制 device_id 用户
        op.execute("""
            INSERT INTO users_new (id, device_id, nickname, created_at)
            SELECT id, device_id, nickname, created_at FROM users
            WHERE device_id IS NOT NULL
        """)

        op.execute("DROP TABLE users")
        op.execute("ALTER TABLE users_new RENAME TO users")
        op.execute("CREATE INDEX ix_users_device_id ON users(device_id)")
    else:
        # 按相反顺序回滚
        op.alter_column("users", "device_id", nullable=False)
        op.drop_index(op.f("ix_users_email"), table_name="users")
        op.drop_column("users", "auth_type")
        op.drop_column("users", "hashed_password")
        op.drop_column("users", "email")
