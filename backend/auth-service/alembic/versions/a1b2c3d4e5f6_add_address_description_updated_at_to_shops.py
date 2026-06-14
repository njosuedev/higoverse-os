"""add address, description, updated_at to shops

Revision ID: a1b2c3d4e5f6
Revises: 47e1995066d5
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '47e1995066d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shops', sa.Column('address',     sa.String(500), nullable=True))
    op.add_column('shops', sa.Column('description', sa.Text(),      nullable=True))
    op.add_column('shops', sa.Column('updated_at',  sa.DateTime(),  nullable=True))


def downgrade() -> None:
    op.drop_column('shops', 'updated_at')
    op.drop_column('shops', 'description')
    op.drop_column('shops', 'address')
