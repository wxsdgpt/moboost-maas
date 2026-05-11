from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OverrideType, RuleCategory, Severity


class RuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    market: str
    code: str
    category: RuleCategory
    severity: Severity
    title: str
    message: str
    suggested_fix: str | None
    trigger: dict = Field(default_factory=dict)
    regulation_reference: str | None
    reference_url: str | None = None
    reason_required_by_default: bool
    effective_from: date | None = None
    effective_to: date | None = None
    version: int
    is_active: bool


class FindingOut(BaseModel):
    rule_id: str
    rule_code: str
    rule_version: int
    severity: Severity
    message: str
    suggested_fix: str | None
    regulation_reference: str | None
    detected_content: str | None
    trigger_location: dict | None
    reason_required: bool
    deferred: bool


class CheckResult(BaseModel):
    market: str
    sub_market: str | None
    overall_status: str
    findings: list[FindingOut]
    effective_rule_count: int
    disabled_rule_count: int


class CheckRequest(BaseModel):
    localized_asset_id: uuid.UUID


class OverrideCreate(BaseModel):
    system_rule_id: uuid.UUID | None = None
    override_type: OverrideType
    modifications: dict = Field(default_factory=dict)
    new_rule_definition: dict | None = None
    change_reason: str = Field(min_length=10, max_length=2000)
    effective_from: date | None = None
    effective_to: date | None = None


class OverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    brand_id: uuid.UUID
    system_rule_id: uuid.UUID | None
    override_type: OverrideType
    modifications: dict = Field(default_factory=dict)
    new_rule_definition: dict | None = None
    change_reason: str
    effective_from: date | None
    effective_to: date | None
    version: int
    is_active: bool
    created_at: datetime


class AcknowledgmentIn(BaseModel):
    rule_id: str
    rule_version: int
    severity: Severity
    reason_provided: str | None = None


class ConfirmRequest(BaseModel):
    acknowledgments: list[AcknowledgmentIn] = Field(default_factory=list)
    comments: list[str] = Field(default_factory=list)


class ConfirmationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    localized_asset_id: uuid.UUID
    confirmed_by: uuid.UUID
    confirmed_at: datetime
    effective_rules_snapshot_hash: str
    acknowledgments: list[dict] = Field(default_factory=list)
    comments: list[dict] = Field(default_factory=list)
