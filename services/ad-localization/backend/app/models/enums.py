"""Domain enums. Strings are stored as lowercase to stay DB-friendly."""

from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    ad_ops = "ad_ops"
    brand_admin = "brand_admin"
    system_admin = "system_admin"


class Market(str, enum.Enum):
    US = "US"
    UK = "UK"
    PH = "PH"
    IN_ = "IN"
    BR = "BR"
    FR = "FR"
    DE = "DE"
    NG = "NG"


class SubMarketHandler(str, enum.Enum):
    per_state_operating = "per_state_operating"  # US, NG
    blocklist = "blocklist"  # IN
    optional_dual = "optional_dual"  # UK (GB default, NI opt-in)
    federal_only = "federal_only"  # DE, FR, PH
    federal_placeholder = "federal_placeholder"  # BR (prepared for future sub-markets)


class OperationalStatus(str, enum.Enum):
    active = "active"
    blocked = "blocked"
    limited = "limited"
    tribal_only = "tribal_only"
    volatile = "volatile"
    inactive = "inactive"


class SourceType(str, enum.Enum):
    psd = "psd"
    ai = "ai"
    png = "png"
    jpg = "jpg"
    mp4 = "mp4"
    txt = "txt"
    csv = "csv"
    md = "md"


class ParseStatus(str, enum.Enum):
    pending = "pending"
    parsing = "parsing"
    parsed = "parsed"
    failed = "failed"


class LUType(str, enum.Enum):
    text = "text"
    visual = "visual"
    audio = "audio"


class TextStrategy(str, enum.Enum):
    keep_original = "keep_original"
    literal_translate = "literal_translate"
    light_localize = "light_localize"
    transcreate = "transcreate"
    user_provided = "user_provided"


class VisualStrategy(str, enum.Enum):
    keep_original = "keep_original"
    replace_for_compliance = "replace_for_compliance"
    localize_culturally = "localize_culturally"
    custom_replace = "custom_replace"


class AudioStrategy(str, enum.Enum):
    keep_original = "keep_original"
    add_subtitles_only = "add_subtitles_only"
    replace_dialogue = "replace_dialogue"
    keep_with_subtitles = "keep_with_subtitles"


class SemanticRole(str, enum.Enum):
    cta = "cta"
    headline = "headline"
    body = "body"
    legal = "legal"
    odds = "odds"
    brand_name = "brand_name"
    product_name = "product_name"
    tagline = "tagline"
    disclaimer = "disclaimer"
    decorative = "decorative"
    # visual roles
    person = "person"
    scene_background = "scene_background"
    prop = "prop"
    sports_element = "sports_element"
    logo = "logo"
    lifestyle_object = "lifestyle_object"
    # audio roles
    dialogue = "dialogue"
    voiceover = "voiceover"
    music = "music"
    sfx = "sfx"
    ambient = "ambient"


class ComplianceElementType(str, enum.Enum):
    age_label = "age_label"
    rg_logo = "rg_logo"
    rg_hotline = "rg_hotline"
    license_number = "license_number"
    mandatory_warning = "mandatory_warning"
    tcs_link = "tcs_link"


class JobStatus(str, enum.Enum):
    draft = "draft"
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    partial = "partial"


class LocalizedAssetStatus(str, enum.Enum):
    draft = "draft"
    compliance_checking = "compliance_checking"
    awaiting_confirmation = "awaiting_confirmation"
    confirmed = "confirmed"
    distributed = "distributed"


class Severity(str, enum.Enum):
    critical = "critical"
    warning = "warning"
    info = "info"


class RuleCategory(str, enum.Enum):
    forbidden_word = "forbidden_word"
    required_element = "required_element"
    visual_restriction = "visual_restriction"
    structural = "structural"
    platform_policy = "platform_policy"
    scheduling = "scheduling"
    audio_restriction = "audio_restriction"


class OverrideType(str, enum.Enum):
    add = "add"
    tighten = "tighten"
    relax = "relax"
    disable = "disable"


class AIModel(str, enum.Enum):
    nano_banana = "nano_banana"
    veo_3_1 = "veo_3_1"
    claude = "claude"
    gpt_4 = "gpt_4"
    gemini = "gemini"


class AIStatus(str, enum.Enum):
    success = "success"
    failed = "failed"
    filtered = "filtered"
    cached = "cached"


class ProcessingMethod(str, enum.Enum):
    psd_layer_swap = "psd_layer_swap"
    nano_banana_edit = "nano_banana_edit"
    veo_audio_regen = "veo_audio_regen"
    llm_translate = "llm_translate"
    no_change = "no_change"
