"""add permissions to users, created_at to refresh_tokens

Revision ID: d4e5f6a7b8c9
Revises: b1c2d3e4f5a6
Create Date: 2026-07-15 00:00:00.000000

Part of the Shop Authentication refactor: staff (users) gain a permissions
column for JWT claim derivation, and refresh_tokens gains created_at for
audit/rotation bookkeeping. Both additive — no data loss, no downtime.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_cols = {c['name'] for c in inspector.get_columns('users')}
    if 'permissions' not in user_cols:
        op.add_column('users', sa.Column('permissions', postgresql.JSON(), nullable=True))

    if inspector.has_table('refresh_tokens'):
        rt_cols = {c['name'] for c in inspector.get_columns('refresh_tokens')}
        if 'created_at' not in rt_cols:
            op.add_column('refresh_tokens', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('refresh_tokens', 'created_at')
    op.drop_column('users', 'permissions')
