from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    AudioStrategy,
    ComplianceElementType,
    LUType,
    SemanticRole,
    TextStrategy,
    VisualStrategy,
)


class LocalizableUnit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Single-table polymorphic LU. Type-specific fields live in ``source_content`` /
    ``source_location`` JSONB. Semantic role and default strategy are normalized columns
    to enable cheap filtering in the strategy-matrix UI.
    """

    __tablename__ = "localizable_units"

    parsed_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("parsed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    lu_type: Mapped[LUType] = mapped_column(Enum(LUType, name="lu_type"), nullable=False)

    # Polymorphic payload (see DATA_MODELS.md TextLU / VisualLU / AudioLU)
    source_content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source_location: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    semantic_role: Mapped[SemanticRole | None] = mapped_column(
        Enum(SemanticRole, name="semantic_role"), nullable=True
    )

    # Default strategy recorded as string (so a single column fits all three strategy enums)
    default_strategy: Mapped[str | None] = mapped_column(String(40), nullable=True)

    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_length_constraint: Mapped[int | None] = mapped_column(Integer, nullable=True)

    parser_confidence: Mapped[float | None] = mapped_column(Numeric(5, 3), nullable=True)
    detection_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    parsed_asset = relationship("ParsedAsset", back_populates="localizable_units")

    # --- helpers ------------------------------------------------------------

    def valid_strategies(self) -> list[str]:
        if self.lu_type is LUType.text:
            return [s.value for s in TextStrategy]
        if self.lu_type is LUType.visual:
            return [s.value for s in VisualStrategy]
        if self.lu_type is LUType.audio:
            return [s.value for s in AudioStrategy]
        return []


class ComplianceUnit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Auto-injected compliance element (age label, RG logo, warning, license number, ...)."""

    __tablename__ = "compliance_units"

    parsed_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("parsed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    element_type: Mapped[ComplianceElementType] = mapped_column(
        Enum(ComplianceElementType, name="compliance_element_type"), nullable=False
    )

    market_content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    placement_strategy: Mapped[str] = mapped_column(
        String(50), nullable=False, default="user_choosable_within_constraints"
    )
    user_placement_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    parsed_asset = relationship("ParsedAsset", back_populates="compliance_units")
