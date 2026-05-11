from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import Market, OperationalStatus, SubMarketHandler


class SubMarket(Base, TimestampMixin):
    """
    Represents a sub-market. Primary key is a composite string like 'US-NJ', 'NG-LA',
    'UK-GB', 'IN-KA'. Federal-only markets have a single entry id == parent_market (e.g., 'DE').
    """

    __tablename__ = "sub_markets"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    parent_market: Mapped[Market] = mapped_column(Enum(Market, name="market"), nullable=False)
    handler: Mapped[SubMarketHandler] = mapped_column(
        Enum(SubMarketHandler, name="sub_market_handler"), nullable=False
    )

    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    region_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    operational_status: Mapped[OperationalStatus] = mapped_column(
        Enum(OperationalStatus, name="operational_status"),
        nullable=False,
        default=OperationalStatus.active,
    )
    legalization_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_reviewed_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    regulatory_body: Mapped[str | None] = mapped_column(String(255), nullable=True)
    law_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # per-state / per-sub-market compliance scaffolding
    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    license_number_format: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rg_hotline: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rg_logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mandatory_disclaimers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Language + currency tags (BCP 47 / ISO 4217)
    content_language: Mapped[str | None] = mapped_column(String(20), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)

    prompt_overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class BrandINConfig(Base, TimestampMixin):
    __tablename__ = "brand_in_configs"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        primary_key=True,
    )
    gray_zone_override: Mapped[str | None] = mapped_column(String(10), nullable=True)
    additional_blocked_states: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    volatile_state_decisions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class BrandUSOperations(Base, TimestampMixin):
    __tablename__ = "brand_us_operations"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        primary_key=True,
    )
    operated_in_states: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    license_numbers_by_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    state_specific_rg_hotlines: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class BrandNGOperations(Base, TimestampMixin):
    __tablename__ = "brand_ng_operations"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        primary_key=True,
    )
    operated_in_states: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    license_numbers_by_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    state_specific_rg_hotlines: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
