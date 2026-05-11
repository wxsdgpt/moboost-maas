# Brand Restrictions & Glossary

## Overview

For a localization tool (not creative generation), brand handling is significantly simplified. The source asset already carries the creative tone, composition, and brand look. What we need from the brand system is:

1. **Brand Restrictions**: What must NOT appear (for compliance and brand safety)
2. **Brand Glossary**: Terminology that must be consistent or preserved
3. **Brand Voice** (only for transcreation): Voice attributes when creative rewriting is chosen

This is much lighter than a full brand system for generation tools. Campaign configuration is **not in V1** — the source asset's creative decisions already embody the campaign.

## Brand Data Model (Simplified)

```typescript
Brand {
  id: UUID
  name: string
  display_name_by_market: {
    [market: string]: string           // localized brand name if different
  }
  
  // === Restrictions ===
  restrictions: {
    forbidden_elements: [              // universal across markets
      {
        element: string,               // "alcohol", "cash piles", "minors"
        reason: string,
        severity: "hard_block" | "avoid" | "flag_for_review"
      }
    ]
    forbidden_themes: string[]
    competitor_brands: string[]        // never reference or resemble
    
    market_specific_restrictions: {    // in addition to universal
      [market: string]: {
        additional_forbidden_elements: string[]
        additional_forbidden_themes: string[]
      }
    }
  }
  
  // === Voice (only used in transcreation) ===
  voice: {
    attributes: string[]               // ["Confident", "Trustworthy"]
    personality_description: string
    voice_dos: string[]
    voice_donts: string[]
    prohibited_phrases: string[]
  }
  
  // === Metadata ===
  created_by: UUID
  approved_by: UUID                    // brand director
  version: int
  status: "active" | "archived"
}
```

## Brand Glossary

Glossary handles terminology consistency across localizations:

```typescript
GlossaryEntry {
  id: UUID
  brand_id: UUID
  
  source_term: string
  source_language: string
  
  category: "brand_name" | "product_name" | "feature_name" | 
            "legal_term" | "sport_term" | "signature_phrase"
  
  // Key behavior: how to handle in each market
  translations: {
    [market: string]: {
      behavior: "keep_original" | "use_translation" | "use_alternate",
      translated_term?: string,
      alternate_forms?: string[],    // accepted variations
      context_note?: string          // when to use which
    }
  }
  
  // For slogan-level content
  locked_transcreations?: {         // pre-approved transcreations by market
    [market: string]: string
  }
  
  approved_by: UUID
  version: int
}
```

### Glossary Examples

**Brand name (always preserved)**:
```json
{
  "source_term": "BetExample",
  "category": "brand_name",
  "translations": {
    "US": { "behavior": "keep_original" },
    "UK": { "behavior": "keep_original" },
    "DE": { "behavior": "keep_original" },
    "FR": { "behavior": "keep_original" },
    "BR": { "behavior": "keep_original" },
    "IN": { "behavior": "keep_original" },
    "PH": { "behavior": "keep_original" },
    "NG": { "behavior": "keep_original" }
  }
}
```

**Product name (mostly preserved, one market translates)**:
```json
{
  "source_term": "SmartCashOut",
  "category": "product_name",
  "translations": {
    "US": { "behavior": "keep_original" },
    "UK": { "behavior": "keep_original" },
    "DE": { "behavior": "use_translation", "translated_term": "Schnell-Auszahlung" },
    "FR": { "behavior": "keep_original" },
    "BR": { "behavior": "keep_original" },
    "IN": { "behavior": "keep_original" },
    "PH": { "behavior": "keep_original" },
    "NG": { "behavior": "keep_original" }
  }
}
```

**Sport term (market-specific translation)**:
```json
{
  "source_term": "football",
  "category": "sport_term",
  "translations": {
    "US": { 
      "behavior": "use_alternate", 
      "alternate_forms": ["football", "NFL"],
      "context_note": "American football context"
    },
    "UK": { "behavior": "keep_original" },
    "DE": { "behavior": "use_translation", "translated_term": "Fußball" },
    "FR": { "behavior": "use_translation", "translated_term": "football" },
    "BR": { 
      "behavior": "use_translation", 
      "translated_term": "futebol",
      "alternate_forms": ["futebol", "bola"],
      "context_note": "bola for casual/conversational"
    },
    "IN": { 
      "behavior": "keep_original",
      "context_note": "English dominant; cricket more popular"
    },
    "PH": { "behavior": "keep_original" },
    "NG": {
      "behavior": "keep_original",
      "context_note": "Soccer/association football; dominant sport. Premier League and AFCON references land well; 'soccer' sounds American — stick with 'football'."
    }
  }
}
```

**Locked transcreation (pre-approved slogan)**:
```json
{
  "source_term": "The smart way to play",
  "category": "signature_phrase",
  "translations": { ... },
  "locked_transcreations": {
    "DE": "Clever spielen",
    "FR": "Jouer intelligemment",
    "BR": "O jeito inteligente de jogar"
  }
}
```
When a text LU matches a source_term with locked transcreations, system uses the locked version without LLM call.

## Brand Voice (Transcreation Only)

Brand voice data is only consumed by `TEXT_TRANSCREATE` use case. For literal translations or light localization, voice is not applied.

Example voice block used in transcreation prompt:
```
Brand Voice for BetExample:
- Attributes: Confident, Trustworthy, Clear
- Personality: Premium but approachable, never arrogant or hype-driven.
- DO: Use direct, clear language. Reference sports passion genuinely.
- DON'T: Use guaranteed wins language. Avoid risk-free claims. No pressure tactics.
- Never use phrases: "sure thing", "easy money", "can't lose", "risk-free"
```

## Removed from V1 (Previously Planned)

These were in earlier drafts but removed given localization-only positioning:

- **Campaign configuration and tone presets**: Source asset already carries tone
- **Brand visual identity system (colors, fonts, reference packs)**: Source asset provides visuals
- **Complex voice tone attribute matrix**: Simplified to essential dos/donts
- **Campaign → Brand inheritance rules**: Not needed without campaigns
- **Brand market variants with voice adjustments**: Simplified to market-specific restrictions only

Can be added in V2 if the tool expands to creative generation use cases.

## How Brand Flows Into Prompt Assembly

The `BrandRestrictionsLayer` is applied to ALL AI operations:
- Ensures forbidden elements don't get introduced in any edit
- Provides market-specific additional restrictions

The `BrandGlossaryLayer` is applied to all text use cases:
- For literal/light: enforces terminology mappings
- For transcreation: includes glossary as constraints
- Checks for `locked_transcreations` and short-circuits LLM when matched

The `BrandVoiceLayer` is applied only to `TEXT_TRANSCREATE`:
- Provides voice guidance to LLM for creative rewriting
- Other use cases don't consume voice (source asset already defines it)

## V1 Scope

### Required
- Brand CRUD (name, restrictions, voice)
- Glossary CRUD with market-level translations
- Glossary `locked_transcreations` support
- Brand → Prompt Assembly integration
- Version history

### Deferred
- Multi-brand portfolio management
- Visual identity system (colors, fonts, reference images)
- Campaign configuration
- Brand voice fine-tuning from examples
- Market-specific brand variants

## Governance

- Brand creation: Brand Manager proposes, Brand Director approves
- Glossary changes: Marketing specialist proposes, Market Manager approves, Legal approves for legal terms
- Voice changes: Brand Director approves
- All changes versioned, older versions retained for audit
