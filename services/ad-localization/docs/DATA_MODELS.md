# 核心数据模型

## Source Asset

```typescript
SourceAsset {
  id: UUID
  project_id: UUID
  uploaded_by: UUID
  
  source_type: "psd" | "ai" | "png" | "jpg" | "mp4"
  source_file_url: string              // S3
  source_file_hash: string             // SHA256 for integrity
  has_editable_layers: boolean         // true for PSD/AI
  
  file_metadata: {
    size_bytes: int
    dimensions: { width, height, duration_seconds? }
    frame_rate?: number                // video
    layer_count?: int                  // PSD
    format_details: object
  }
  
  brand_id: UUID
  tags: string[]
  
  parsed_asset_id?: UUID               // link to parse result
  parse_status: "pending" | "parsing" | "parsed" | "failed"
  
  created_at: timestamp
}
```

## Parsed Asset

```typescript
ParsedAsset {
  id: UUID
  source_asset_id: UUID
  
  parse_method: "psd_tools" | "multimodal_llm" | "video_analyzer"
  parse_model_used?: string            // "gemini-2.5-pro" etc.
  parse_confidence: number
  parse_warnings: string[]
  
  structural_metadata: {
    layer_tree?: LayerNode             // for PSD
    scene_boundaries?: TimeRange[]     // for video
    audio_channels?: int
    text_detection_coverage?: number
  }
  
  parsed_at: timestamp
  parse_duration_ms: int
}
```

## Localizable Unit (LU)

Base model (polymorphic by type):

```typescript
LocalizableUnit {
  id: UUID
  parsed_asset_id: UUID
  lu_type: "text" | "visual" | "audio"
  
  source_content: object               // type-specific (see below)
  source_location: object              // type-specific
  
  semantic_role: string                // "cta" | "legal" | "person" | "dialogue" etc.
  default_strategy: string             // computed from rules
  is_locked: boolean                   // user can't change (e.g., legal)
  
  parser_confidence: number
  detection_metadata: object
}

// Polymorphic extensions
TextLU extends LocalizableUnit {
  source_content: {
    text: string
    language: string
    font_info?: FontInfo
    style_info?: StyleInfo
  }
  source_location: {
    type: "psd_layer" | "image_region" | "video_region" | "metadata"
    psd_layer_id?: string
    bbox?: [x, y, w, h]
    time_range?: [start, end]
    field_name?: string
  }
  max_length_constraint?: int
}

VisualLU extends LocalizableUnit {
  source_content: {
    description: string
    element_type: "person" | "scene" | "prop" | "sports_element" | "logo"
    detected_attributes: object
  }
  source_location: {
    type: "psd_layer" | "image_region" | "video_region"
    psd_layer_id?: string
    bbox?: [x, y, w, h]
    mask_url?: string                  // precise region for AI editing
    time_range?: [start, end]
  }
}

AudioLU extends LocalizableUnit {
  source_content: {
    audio_type: "dialogue" | "voiceover" | "music" | "sfx" | "ambient"
    transcript?: string
    source_language?: string
    detected_attributes: {
      emotion_intensity: number
      voice_gender?: string
      pace?: string
    }
  }
  source_location: {
    time_range: [start, end]
    channel?: int
  }
}
```

## Compliance Unit (auto-injected)

```typescript
ComplianceUnit {
  id: UUID
  source_asset_id: UUID
  element_type: "age_label" | "rg_logo" | "rg_hotline" | 
                "license_number" | "mandatory_warning" | "tcs_link"
  
  market_content: {
    [market: string]: {
      text?: string
      asset_url?: string
      required_size_ratio: number
      required_position_options: string[]
      regulation_reference: string     // e.g., "GlüStV §5"
    }
  }
  
  user_placement_override?: object     // user-chosen position within constraints
}
```

## Localization Job

```typescript
LocalizationJob {
  id: UUID
  source_asset_id: UUID
  requested_by: UUID
  
  target_markets: string[]             // ["US", "UK", "DE", "FR", "BR", "IN", "PH", "NG"]
  
  strategy_matrix: {
    [lu_id: string]: {
      [market: string]: {
        strategy: string               // "literal_translate" etc.
        user_instructions?: string
        user_provided_content?: string
      }
    }
  }
  
  status: "draft" | "queued" | "processing" | 
          "completed" | "failed" | "partial"
  
  created_at: timestamp
  started_at?: timestamp
  completed_at?: timestamp
  
  estimated_cost_usd: decimal
  actual_cost_usd: decimal
}
```

## Localized Asset (per market or sub-market output)

```typescript
LocalizedAsset {
  id: UUID
  localization_job_id: UUID
  source_asset_id: UUID
  
  // Market targeting
  target_market: string                // "US", "UK", "DE", "IN", "NG", etc.
  target_sub_market?: string           // "US-NJ", "US-PA", "NG-LA", "NG-FCT", "UK-GB", "UK-NI" (null for federal-only markets)
  
  output_file_url: string              // final assembled asset
  output_file_hash: string
  
  unit_outputs: [                      // what happened to each LU
    {
      lu_id: UUID
      strategy_applied: string
      processing_method: "psd_layer_swap" | "nano_banana_edit" | 
                        "veo_audio_regen" | "llm_translate" | "no_change"
      output_content: object
      ai_generation_id?: UUID
      change_minimization_verified: boolean
      change_minimization_score: number
    }
  ]
  
  compliance_overlay_applied: boolean
  compliance_check_id?: UUID
  
  status: "draft" | "compliance_checking" | "awaiting_confirmation" | 
          "confirmed" | "distributed"
  
  confirmation_id?: UUID
  
  // Distribution metadata (state-level for US and IN)
  platform_metadata: {
    allowed_time_windows?: [number, number]      // DE restriction
    allowed_regions?: string[]                   // country codes
    allowed_sub_regions?: string[]               // US: state codes where allowed
    blocked_sub_regions?: string[]               // IN: state codes to geo-fence
    blocked_sub_regions_reason?: string          // "local_law_prohibition"
    allowed_platforms?: string[]
  }
  
  created_at: timestamp
}
```

## Sub-Market Data Models

```typescript
SubMarket {
  id: string                           // "US-NJ", "US-PA", "NG-LA", "NG-FCT", "UK-GB", "UK-NI"
  parent_market: string                // "US", "IN", "NG", "UK"
  display_name: string                 // "New Jersey", "Lagos", "Federal Capital Territory"
  region_code: string                  // "NJ", "LA", "FCT"
  
  operational_status: "active" | "blocked" | "limited" | 
                      "tribal_only" | "volatile" | "inactive"
  legalization_date?: date
  last_reviewed_at: date
  
  regulatory_body?: string             // "NJ Division of Gaming Enforcement",
                                       // "Lagos State Lotteries and Gaming Authority (LSLGA)",
                                       // "National Lottery Regulatory Commission (NLRC)"
  law_reference?: string               // e.g. "Lagos State Lotteries and Gaming Authority Law 2021",
                                       // "National Lottery Act 2005"
  
  // Shared by PER_STATE_OPERATING markets (US, NG)
  min_age?: 18 | 21
  license_number_format?: string
  rg_hotline?: string
  rg_logo_url?: string
  mandatory_disclaimers?: [
    { text: string, placement: string, language: string }
  ]
  
  prompt_overrides?: {
    forbidden_terms: string[]
    required_tone_adjustments: string[]
  }
  
  compliance_rule_pack_id?: UUID       // only for "active" sub-markets
  
  notes: string
}
```

**NG-specific example**:
```typescript
{
  id: "NG-LA",
  parent_market: "NG",
  display_name: "Lagos",
  region_code: "LA",
  operational_status: "active",
  regulatory_body: "Lagos State Lotteries and Gaming Authority (LSLGA)",
  law_reference: "Lagos State Lotteries and Gaming Authority Law 2021",
  min_age: 18,
  license_number_format: "LSLGA-\\d{5}",
  rg_hotline: "0800-GAMBLE-NG",
  mandatory_disclaimers: [
    { text: "18+ only. Play responsibly.", placement: "footer", language: "en" }
  ],
  prompt_overrides: {
    forbidden_terms: ["guaranteed win", "no risk", "easy money", "sure thing"],
    required_tone_adjustments: [
      "avoid targeting youth culture",
      "football references generic (avoid active Super Eagles players without license)"
    ]
  },
  notes: "LSLGA enforces 5% withholding tax on player winnings from Feb 2026."
}
```

INStateConfig {
  market: "IN"
  
  allowlist_states: [
    { code: string, name: string, notes: string }
  ]
  blocklist_states: [
    { code: string, name: string, law: string, last_updated: date }
  ]
  gray_zone_states: [
    { code: string, name: string }
  ]
  
  gray_zone_default_behavior: "allow" | "block"
  
  volatile_states: [                   // e.g., Karnataka
    { code: string, last_updated: date, current_default: "allow" | "block" }
  ]
}

BrandINConfig {
  brand_id: UUID
  
  gray_zone_override: "allow" | "block" | null  // null = use system default
  additional_blocked_states: string[]
  volatile_state_decisions: {
    [state_code: string]: "allow" | "block"
  }
  
  last_updated_by: UUID
  last_updated_at: timestamp
}

BrandUSOperations {
  brand_id: UUID
  
  operated_in_states: string[]         // ["NJ", "PA", "NY", ...]
  license_numbers_by_state: {
    [state_code: string]: string
  }
  state_specific_rg_hotlines: {        // overrides default 1-800-GAMBLER
    [state_code: string]: string
  }
  
  last_updated_by: UUID
  last_updated_at: timestamp
}

BrandNGOperations {
  brand_id: UUID
  
  operated_in_states: string[]         // ["LA", "FCT", "OY", ...]
  license_numbers_by_state: {
    [state_code: string]: string       // e.g. { "LA": "LSLGA-12345", "FCT": "NLRC-2026-0042" }
  }
  state_specific_rg_hotlines: {
    [state_code: string]: string
  }
  
  last_updated_by: UUID
  last_updated_at: timestamp
}
```

## Compliance Rule

```typescript
ComplianceRule {
  id: UUID
  market: string                       // "DE", "US-NJ", etc.
  state?: string                       // for US sub-markets
  
  category: "forbidden_word" | "required_element" | 
            "visual_restriction" | "structural" | 
            "platform_policy" | "scheduling" | "audio_restriction"
  
  severity: "blocking" | "warning" | "info"
  
  trigger: {
    type: "text_match" | "regex" | "image_detection" | 
          "audio_detection" | "metadata_check"
    conditions: object
  }
  
  message: string
  suggested_fix: string
  regulation_reference: string         // "GlüStV §5 Abs. 3"
  reference_url: string
  
  effective_from: date
  effective_to?: date
  version: int
  
  created_by: UUID
  last_reviewed_by: UUID
  last_reviewed_at: timestamp
}
```

## Compliance Check Report

```typescript
ComplianceCheckReport {
  id: UUID
  localized_asset_id: UUID
  checked_at: timestamp
  rule_snapshot_version: string
  
  overall_status: "passed" | "warnings" | "blocked"
  
  findings: [
    {
      rule_id: UUID
      severity: string
      trigger_location: {              // points to specific LU or region
        lu_id?: UUID
        region?: object
        time?: number
      }
      detected_content: string
      suggested_fix: string
    }
  ]
  
  ai_vision_checks: {
    age_estimation: number[]
    celebrity_detection: string[]
    logo_detection: string[]
    cartoon_detection: boolean
    excitement_intensity: number       // for DE/FR audio compliance
  }
  
  change_minimization: {
    all_untouched_regions_preserved: boolean
    average_hash_score: number
    failed_regions: object[]
  }
  
  human_review_required: boolean
  report_pdf_url: string
}
```

## Asset Confirmation（取代 ApprovalWorkflow）

```typescript
AssetConfirmation {
  id: UUID
  localized_asset_id: UUID
  confirmed_by: UUID                    // Ad Ops user
  confirmed_at: timestamp
  
  compliance_report_snapshot: ComplianceReport  // full report at confirmation time
  effective_rules_snapshot_hash: string         // hash of system+brand rules at that moment
  
  acknowledgments: [
    {
      finding_id: UUID
      rule_id: UUID
      rule_version: int
      severity: "critical" | "warning" | "info"
      acknowledged_at: timestamp
      reason_provided?: string            // required if rule flagged as reason_required
      reason_length?: int
    }
  ]
  
  brand_override_state: {                 // snapshot of overrides active at confirmation
    active_override_ids: UUID[]
    disabled_system_rules: UUID[]
  }
  
  comments: Comment[]                     // Ad Ops notes (optional)
  
  ip_address: string
  user_agent: string
  
  // NEVER UPDATABLE — append-only audit record
}

Comment {
  id: UUID
  user_id: UUID
  content: string
  target_lu_id?: UUID
  target_region?: object
  created_at: timestamp
}
```

**Key change from original design**: Replaced the multi-stage `ApprovalWorkflow` with a single `AssetConfirmation` record. No legal review stage. No rejection path (Ad Ops either confirms or goes back to edit — not a formal reject).

## Brand Rule Override

```typescript
BrandRuleOverride {
  id: UUID
  brand_id: UUID
  system_rule_id?: UUID                 // which system rule (null if "add" type)
  
  override_type: "add" | "tighten" | "relax" | "disable"
  
  // For "tighten" or "relax"
  modifications?: {
    severity?: "critical" | "warning" | "info"
    trigger_conditions?: object
    message_override?: string
    reason_required_override?: boolean
  }
  
  // For "add"
  new_rule_definition?: ComplianceRule
  
  created_by: UUID                      // brand admin
  created_at: timestamp
  change_reason: string
  effective_from: date
  effective_to?: date
  
  version: int
  is_active: boolean
  
  // Notifications triggered
  notified_brand_members: bool
  notified_system_admin: bool
}

BrandOverrideChangeLog {
  id: UUID                              // separate, append-only history
  override_id: UUID
  changed_by: UUID
  change_type: "created" | "modified" | "deactivated"
  previous_state: object                // snapshot of before-change
  new_state: object
  timestamp: timestamp
}
```

## Rule Reason Requirement Configuration

```typescript
BrandReasonRequirementConfig {
  id: UUID
  brand_id: UUID
  
  # System defaults (ship with product)
  system_default_rules_requiring_reason: UUID[]
  
  # Brand-level additions or removals
  user_added_rules_requiring_reason: UUID[]
  user_removed_from_reason_required: UUID[]
  
  min_reason_length: int                // default 30
  
  updated_by: UUID
  updated_at: timestamp
}
```

## User Roles (Updated)

```typescript
User {
  id: UUID
  email: string
  name: string
  
  primary_role: "ad_ops" | "brand_admin" | "system_admin"
  
  brand_memberships: [
    {
      brand_id: UUID
      role: "ad_ops" | "brand_admin"    // within this brand
      added_at: timestamp
    }
  ]
  
  is_system_admin: bool                 // cross-brand read access
  
  sso_provider?: string
  last_login_at?: timestamp
}
```

**Removed**: `legal` role, `market_manager` as separate role. Ad ops does the final confirmation. Brand admin manages brand-level overrides and settings.

## Audit Log (append-only)

```typescript
AuditLog {
  id: UUID
  entity_type: string
  entity_id: UUID
  action: "created" | "updated" | "approved" | 
          "rejected" | "distributed" | "taken_down"
  actor_id: UUID
  changes: object                      // before/after diff
  ip_address: string
  user_agent: string
  timestamp: timestamp                 // NOT UPDATABLE
}
```

## AI Generation Log (audit-critical)

```typescript
AIGenerationLog {
  id: UUID
  localized_asset_id: UUID
  lu_id?: UUID                         // which LU this was for
  use_case: string                     // IMAGE_TEXT_REPLACE, etc.
  model: "nano_banana" | "veo_3_1" | "claude" | "gpt_4" | "gemini"
  
  assembly_trace: {
    context_snapshot: object
    layers_applied: [
      {
        layer_name: string
        priority: int
        version: string
        contribution: object
      }
    ]
    final_output: {
      prompt?: string
      negative_prompt?: string
      system_prompt?: string
      reference_assets: string[]
      forced_params: object
    }
  }
  
  input_hash: string                   // for TM cache lookups
  
  output: {
    file_urls?: string[]
    text_output?: string
    generation_time_ms: int
    cost_usd: decimal
    tokens_used?: { input: int, output: int }
  }
  
  verification: {
    change_minimization_score?: number
    verification_passed?: boolean
  }
  
  status: "success" | "failed" | "filtered" | "cached"
  error_message?: string
  
  cache_hit: boolean                   // served from TM cache?
  cache_key?: string
  
  created_at: timestamp
}
```

## Translation Memory Cache

```typescript
TranslationMemoryEntry {
  id: UUID
  cache_key: string                    // hash(source + use_case + market + brand + glossary_version)
  
  source_text: string
  source_language: string
  target_text: string
  target_market: string
  use_case: string                     // TEXT_LITERAL_TRANSLATE, etc.
  
  brand_id: UUID
  brand_version: int
  glossary_version: int
  
  original_generation_id: UUID         // first AIGenerationLog that produced this
  
  usage_count: int                     // how many times served from cache
  last_used_at: timestamp
  
  approved_by_human: boolean           // was this translation ever human-approved?
  
  created_at: timestamp
  invalidated_at?: timestamp
}
```

## Brand & Glossary (Simplified, see BRAND_AND_GLOSSARY.md)

```typescript
Brand {
  id: UUID
  name: string
  display_name_by_market: { [market: string]: string }
  
  restrictions: {
    forbidden_elements: [
      { element: string, reason: string, severity: string }
    ]
    forbidden_themes: string[]
    competitor_brands: string[]
    market_specific_restrictions: { [market: string]: object }
  }
  
  voice: {
    attributes: string[]
    personality_description: string
    voice_dos: string[]
    voice_donts: string[]
    prohibited_phrases: string[]
  }
  
  version: int
  status: "active" | "archived"
}

GlossaryEntry {
  id: UUID
  brand_id: UUID
  source_term: string
  source_language: string
  category: string
  
  translations: {
    [market: string]: {
      behavior: "keep_original" | "use_translation" | "use_alternate"
      translated_term?: string
      alternate_forms?: string[]
      context_note?: string
    }
  }
  
  locked_transcreations?: { [market: string]: string }
  
  version: int
  approved_by: UUID
}
```

## Cost Tracking

```typescript
CostRecord {
  id: UUID
  
  project_id: UUID
  user_id: UUID
  localization_job_id?: UUID
  ai_generation_log_id: UUID
  
  model: string
  use_case: string
  cost_usd: decimal
  tokens_used?: int
  
  cache_hit: bool                      // if cache hit, cost = 0
  
  timestamp: timestamp
  billing_period: string               // "2026-04" for monthly aggregation
}
```
