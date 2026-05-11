from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import OverrideType, RuleCategory, Severity


class ComplianceRule(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """System-default compliance rule. Brand-level changes live in BrandRuleOverride."""

    __tablename__ = "compliance_rules"

    # `market` is either a parent market ("DE", "US") or a sub-market id ("US-NJ", "NG-LA")
    market: Mapped[str] = mapped_column(String(16), nullable=False, index=True)

    category: Mapped[RuleCategory] = mapped_column(
        Enum(RuleCategory, name="rule_category"), nullable=False
    )
    severity: Mapped[Severity] = mapped_column(
        Enum(Severity, name="severity"), nullable=False, default=Severity.warning
    )

    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(2000), nullable=False)
    suggested_fix: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Trigger DSL: { "type": "text_match"|"regex"|"image_detection"|..., "conditions": {...} }
    trigger: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    regulation_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    reason_required_by_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BrandRuleOverride(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "brand_rule_overrides"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False
    )
    system_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("compliance_rules.id", ondelete="CASCADE"),
        nullable=True,
    )
    override_type: Mapped[OverrideType] = mapped_column(
        Enum(OverrideType, name="override_type"), nullable=False
    )

    # For tighten / relax: partial updates to severity, trigger, message, reason_required_override
    modifications: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # For 'add' override: inline rule definition (mirrors ComplianceRule shape)
    new_rule_definition: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    change_reason: Mapped[str] = mapped_column(String(2000), nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    notified_brand_members: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notified_system_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    brand = relationship("Brand", back_populates="overrides")


class BrandOverrideChangeLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Append-only history for BrandRuleOverride changes."""

    __tablename__ = "brand_override_change_logs"

    override_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brand_rule_overrides.id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    change_type: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    new_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class BrandReasonRequirementConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "brand_reason_requirement_configs"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    user_added_rules_requiring_reason: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    user_removed_from_reason_required: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    min_reason_length: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class ComplianceCheckReport(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "compliance_check_reports"

    localized_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )
    # not a FK back to localized_assets to avoid a circular FK cycle — enforced at service level

    rule_snapshot_version: Mapped[str] = mapped_column(String(100), nullable=False)
    overall_status: Mapped[str] = mapped_column(String(40), nullable=False, default="warnings")

    findings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ai_vision_checks: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    change_minimization: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    human_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    report_storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)


class AssetConfirmation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Append-only record produced when Ad Ops confirms a LocalizedAsset for distribution.
    NEVER mutated after creation.
    """

    __tablename__ = "asset_confirmations"

    localized_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("localized_assets.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    confirmed_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    compliance_report_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    effective_rules_snapshot_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    acknowledgments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    brand_override_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    comments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
