"""A car company renting out one of its cars: the renter, the car, the
period, the rent and the deposit (kosiyo), as printed on the rental agreement
(apps/web lib/rental-print.ts). See routes/rentals.py.
"""
import uuid

from sqlalchemy import Column, DateTime, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class CarRental(Base):
    __tablename__ = "car_rentals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    rental_no = Column(String(20), nullable=False)          # RENT-0001, per business

    # The renter: a saved customer (details copied in) or typed on the form.
    customer_id = Column(String, nullable=True)
    customer = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    customer_id_no = Column(String, nullable=True)
    customer_address = Column(String, nullable=True)

    # The car: from Vehicles (details copied in) or typed.
    product_id = Column(String, nullable=True)
    car_name = Column(String, nullable=False)
    car_type = Column(String, nullable=True)
    plate_no = Column(String, nullable=True)
    chassis_no = Column(String, nullable=True)

    start_date = Column(String(10), nullable=False)          # YYYY-MM-DD
    end_date = Column(String(10), nullable=False)
    agreement_date = Column(String(10), nullable=False)      # the day it is signed
    rent_amount = Column(Numeric(14, 2), nullable=False, default=0)
    deposit = Column(Numeric(14, 2), nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RWF")
    notes = Column(Text, nullable=True)

    # active → returned (or cancelled).
    status = Column(String(12), nullable=False, default="active")
    returned_at = Column(DateTime(timezone=True), nullable=True)
    deposit_returned = Column(Numeric(14, 2), nullable=True)  # given back at the return
    return_note = Column(Text, nullable=True)                 # damage found, etc.

    created_by = Column(String, nullable=True)
    created_by_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
