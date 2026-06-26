"""drop shop FK from users and add missing shop columns

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-06-26 00:00:00.000000

Shop data lives in shop_db only. The auth_db shops table was being kept in
sync but was missing logo_url and last_seen_at, causing 500 on shop-application.
Fix: drop the FK so users.shop_id becomes a plain UUID reference, and add the
missing columns so the shops table stays consistent if any legacy code reads it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # 1. Drop FK constraint on users.shop_id (find it by constrained column)
    for fk in inspector.get_foreign_keys('users'):
        if 'shop_id' in fk.get('constrained_columns', []):
            op.drop_constraint(fk['name'], 'users', type_='foreignkey')
            break

    # 2. Add missing columns to shops table so it stays schema-consistent
    existing_cols = {c['name'] for c in inspector.get_columns('shops')}

    if 'logo_url' not in existing_cols:
        op.add_column('shops', sa.Column('logo_url', sa.Text(), nullable=True))

    if 'last_seen_at' not in existing_cols:
        op.add_column('shops', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Re-add FK (best-effort — may fail if data is inconsistent)
    op.create_foreign_key(
        'users_shop_id_fkey', 'users', 'shops', ['shop_id'], ['id']
    )
