"""All ORM models registered on the shared Base.metadata.

Importing this package is enough for Alembic autogenerate to see every table.
"""

from app.models.ai_log import AIGenerationLog, CostRecord, TranslationMemoryEntry
from app.models.audit import AuditLog
from app.models.base import Base
from app.models.brand import Brand, GlossaryEntry
from app.models.compliance import (
    AssetConfirmation,
    BrandOverrideChangeLog,
    BrandReasonRequirementConfig,
    BrandRuleOverride,
    ComplianceCheckReport,
    ComplianceRule,
)
from app.models.localizable_unit import ComplianceUnit, LocalizableUnit
from app.models.localization_job import LocalizationJob
from app.models.localized_asset import LocalizedAsset
from app.models.parsed_asset import ParsedAsset
from app.models.project import Project
from app.models.source_asset import SourceAsset
from app.models.sub_market import (
    BrandINConfig,
    BrandNGOperations,
    BrandUSOperations,
    SubMarket,
)
from app.models.prompt_override import PromptOverride
from app.models.system_setting import SystemSetting
from app.models.user import BrandMembership, User

__all__ = [
    "Base",
    "User",
    "BrandMembership",
    "Brand",
    "GlossaryEntry",
    "SubMarket",
    "BrandINConfig",
    "BrandUSOperations",
    "BrandNGOperations",
    "Project",
    "SourceAsset",
    "ParsedAsset",
    "LocalizableUnit",
    "ComplianceUnit",
    "LocalizationJob",
    "LocalizedAsset",
    "ComplianceRule",
    "BrandRuleOverride",
    "BrandOverrideChangeLog",
    "BrandReasonRequirementConfig",
    "ComplianceCheckReport",
    "AssetConfirmation",
    "AIGenerationLog",
    "TranslationMemoryEntry",
    "CostRecord",
    "AuditLog",
    "SystemSetting",
    "PromptOverride",
]
