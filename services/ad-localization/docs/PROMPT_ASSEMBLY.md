# Unified Prompt Assembly Architecture

## Overview

All AI operations in this system go through a single **Prompt Assembly** service. Different use cases apply different **Layers** to build the final prompt. This ensures consistency, auditability, and clean separation of concerns.

**Key shift for localization tool**: Most use cases are **edit-focused**, not generation-focused. The Source Anchor Layer is the most important new concept — it ensures AI only changes what it's asked to change.

## Core Model

```
PromptContext + [Layers...] → AssembledPrompt + AssemblyTrace
```

## Layer Abstraction

```typescript
interface PromptLayer {
  name: string
  priority: number                          // Lower runs first
  applies_to: UseCase[]
  apply(context: PromptContext): LayerContribution
}

interface LayerContribution {
  positive_additions?: string[]
  negative_additions?: string[]
  system_additions?: string[]               // LLM system prompt
  user_additions?: string[]                 // LLM user prompt
  reference_assets?: ReferenceAsset[]
  few_shot_examples?: Example[]
  forced_params?: object
  
  // Nano Banana specific
  mask_constraints?: MaskConstraint[]       // region to edit
  preservation_directives?: string[]        // "preserve everything else"
  
  // Veo 3.1 specific
  audio_prompt_additions?: string[]
  motion_prompt_additions?: string[]
  
  metadata: object                          // audit trace
}

interface PromptContext {
  use_case: UseCase
  
  // Source asset context (critical for localization)
  source_asset?: ParsedAsset
  source_lu?: LocalizableUnit
  
  // Targeting
  brand_id?: UUID
  market?: string
  target_language?: string
  
  // Strategy context
  strategy: Strategy                        // what the user chose
  
  // Optional
  user_instructions?: string
  template_id?: UUID
}

enum UseCase {
  // Parsing
  SOURCE_ASSET_PARSE        = "source_parse",        // Multimodal LLM parses source
  
  // Text localization
  TEXT_LITERAL_TRANSLATE    = "text_literal",
  TEXT_LIGHT_LOCALIZE       = "text_light",
  TEXT_TRANSCREATE          = "text_transcreate",
  
  // Image editing
  IMAGE_TEXT_REPLACE        = "image_text_replace",
  IMAGE_ELEMENT_REPLACE     = "image_element_replace",
  IMAGE_ELEMENT_REMOVE      = "image_element_remove",
  
  // Video editing
  VIDEO_TEXT_REPLACE        = "video_text_replace",
  VIDEO_ELEMENT_REPLACE     = "video_element_replace",
  VIDEO_AUDIO_REPLACE       = "video_audio_replace",
  
  // Compliance
  COMPLIANCE_VISION_CHECK   = "compliance_vision",
  COMPLIANCE_EXPLANATION    = "compliance_explain",
  
  // Utility
  ASSET_TAGGING             = "asset_tagging"
}
```

## Layer Library

### Core Structural Layers
- `BaseLayer` — use-case-specific base instructions
- `SourceAnchorLayer` — **critical**: preservation directives for source
- `SourceContextLayer` — source content/asset reference
- `UserInstructionLayer` — explicit user instructions (for custom_replace etc.)

### Brand Layers (Simplified)
- `BrandRestrictionsLayer` — forbidden elements/themes (always applied)
- `BrandVoiceLayer` — voice attributes (only for transcreation)
- `BrandGlossaryLayer` — terminology enforcement (brand names, products)

### Market Layers
- `MarketLanguageLayer` — target language, variants (pt-BR not pt-PT)
- `MarketComplianceLayer` — mandatory elements, forbidden words
- `MarketCultureLayer` — cultural norms, sports context
- `MarketAudioLayer` — accent/voice style for Veo 3.1

### Processing Layers
- `MaskLayer` — region constraints for image/video editing
- `FontStyleLayer` — font, size, color preservation for text edits
- `FewShotLayer` — historical approved examples (transcreation only)

Note: **No Campaign Tone Layer in V1**. Source asset already carries the creative tone. User decisions (keep/translate/transcreate) and market rules are enough. Campaign can be added in V2 if needed.

## Use Case → Layer Composition

### SOURCE_ASSET_PARSE (Multimodal LLM parses source)
```
[BaseLayer: source_parse]
[BrandRestrictionsLayer]       // help identify non-compliant elements
[MarketComplianceLayer]        // help flag missing mandatory elements
[SourceContextLayer]           // the asset itself
```
Output: structured JSON describing text LUs, visual LUs, audio LUs, compliance flags.

### TEXT_LITERAL_TRANSLATE
```
[BaseLayer: text_literal]
[MarketLanguageLayer]
[MarketComplianceLayer]        // forbidden words still apply
[BrandGlossaryLayer]           // brand/product terms preserved
[SourceContextLayer]           // source text
```
Temperature: 0. Very constrained.

### TEXT_LIGHT_LOCALIZE
```
[BaseLayer: text_light]
[MarketLanguageLayer]
[MarketCultureLayer]           // idiomatic adjustments
[MarketComplianceLayer]
[BrandGlossaryLayer]
[SourceContextLayer]
```
Temperature: 0.3. Slight flexibility.

### TEXT_TRANSCREATE
```
[BaseLayer: text_transcreate]
[BrandVoiceLayer]              // full brand voice
[BrandRestrictionsLayer]
[BrandGlossaryLayer]
[MarketLanguageLayer]
[MarketCultureLayer]
[MarketComplianceLayer]
[FewShotLayer]                 // historical approved transcreations
[SourceContextLayer]
[UserInstructionLayer]         // optional user intent
```
Temperature: 0.7 for candidates, lower for refinement.

### IMAGE_TEXT_REPLACE (Nano Banana)
```
[BaseLayer: image_text_replace]
[SourceAnchorLayer]            // CRITICAL: preserve everything outside mask
[MaskLayer]                    // region definition
[FontStyleLayer]               // preserve original font characteristics
[MarketLanguageLayer]          // the new text's language
[MarketComplianceLayer]        // ensure new text is compliant
[SourceContextLayer]           // source image reference
```

### IMAGE_ELEMENT_REPLACE (Nano Banana)
```
[BaseLayer: image_element_replace]
[SourceAnchorLayer]            // preserve composition, lighting, style
[MaskLayer]                    // element region
[BrandRestrictionsLayer]       // don't introduce forbidden elements
[MarketComplianceLayer]        // don't violate market rules
[MarketCultureLayer]           // target cultural version
[UserInstructionLayer]         // user's replacement spec (if custom)
[SourceContextLayer]
```

### IMAGE_ELEMENT_REMOVE (Nano Banana)
```
[BaseLayer: image_element_remove]
[SourceAnchorLayer]            // preserve surroundings
[MaskLayer]                    // element to remove
[SourceContextLayer]
```
Used for compliance-driven removal (e.g., remove alcohol from image).

### VIDEO_TEXT_REPLACE (per-frame Nano Banana)
```
[BaseLayer: video_text_replace]
[SourceAnchorLayer]            // frame-level preservation
[MaskLayer]                    // text region (tracked across frames)
[FontStyleLayer]
[MarketLanguageLayer]
[MarketComplianceLayer]
[SourceContextLayer]           // frame sequence
```
Note: Runs per affected frame range. Consistency check across frames.

### VIDEO_AUDIO_REPLACE (Veo 3.1)
```
[BaseLayer: video_audio_replace]
[SourceAnchorLayer]            // CRITICAL: video frames unchanged
[MarketLanguageLayer]          // target language
[MarketAudioLayer]             // accent, voice style (calm for DE, warm for BR)
[BrandVoiceLayer]              // brand voice if specified
[MarketComplianceLayer]        // no excessive excitement in DE/FR
[SourceContextLayer]           // video + transcript
```

### COMPLIANCE_VISION_CHECK (Multimodal LLM)
```
[BaseLayer: compliance_vision]
[MarketComplianceLayer]        // rules to evaluate against
[BrandRestrictionsLayer]       // brand-specific concerns
[SourceContextLayer]           // the generated asset
```

### COMPLIANCE_EXPLANATION (LLM)
```
[BaseLayer: compliance_explain]
[SourceContextLayer]           // the violation details
```
Generate human-readable explanation.

## Layer Priority Order

```
10  BaseLayer
15  SourceAnchorLayer                    // early so all downstream respects it
20  MaskLayer                            // scope definition
25  FontStyleLayer
30  BrandRestrictionsLayer
35  BrandVoiceLayer
40  BrandGlossaryLayer
50  MarketLanguageLayer
55  MarketCultureLayer
60  MarketAudioLayer
70  UserInstructionLayer
80  SourceContextLayer
85  FewShotLayer
100 MarketComplianceLayer                // HIGHEST: always wins
```

**Critical rule**: `MarketComplianceLayer` and `SourceAnchorLayer` can never be bypassed.

## SourceAnchorLayer — The Key to Localization

This is the most important layer in a localization tool. Its job:

**Tell the AI: "Don't change anything except what I'm explicitly asking."**

Example contribution for `IMAGE_TEXT_REPLACE`:
```python
{
  "positive_additions": [
    "Edit ONLY the text within the specified mask region",
    "Preserve all other pixels exactly as in source image",
    "Maintain original lighting, color grading, shadows, reflections",
    "Do not modify any person, object, or background outside the mask"
  ],
  "negative_additions": [
    "stylistic reinterpretation",
    "creative additions",
    "background changes",
    "lighting changes"
  ],
  "preservation_directives": [
    "perceptual_hash_match_required_outside_mask"
  ]
}
```

For `VIDEO_AUDIO_REPLACE`:
```python
{
  "positive_additions": [
    "Keep ALL video frames exactly as in source",
    "Only replace the audio track",
    "Preserve original video timing, frame rate, resolution"
  ],
  "negative_additions": [
    "video regeneration",
    "frame modification",
    "visual changes"
  ]
}
```

## Change Minimization Verification

After AI-edited operations, verify preservation:

```python
def verify_source_anchoring(
    source: Asset, 
    output: Asset, 
    modified_regions: list[Mask]
) -> VerificationResult:
    for region in get_untouched_regions(source, modified_regions):
        source_hash = perceptual_hash(source, region)
        output_hash = perceptual_hash(output, region)
        
        if not hashes_match(source_hash, output_hash, threshold=0.98):
            return VerificationResult(
                passed=False,
                reason="ChangeBleed",
                region=region,
                action="retry_with_tighter_mask_or_escalate"
            )
    
    return VerificationResult(passed=True)
```

This runs automatically for every AI edit. Failures trigger retry with stricter prompts, or escalate to human review.

## Assembly Trace (Audit Requirement)

Every AI call logs complete trace:

```json
{
  "generation_id": "uuid",
  "use_case": "image_text_replace",
  "timestamp": "2026-04-20T10:00:00Z",
  
  "context_snapshot": {
    "source_asset_id": "uuid",
    "source_asset_hash": "sha256...",
    "source_lu_id": "uuid",
    "brand_id": "uuid", "brand_version": 7,
    "market": "DE",
    "strategy": "light_localize"
  },
  
  "final_output": {
    "prompt": "...",
    "negative_prompt": "...",
    "mask_coordinates": {...},
    "forced_params": {...}
  },
  
  "layers_applied": [
    {
      "layer": "SourceAnchorLayer",
      "priority": 15,
      "contribution": {...}
    },
    ...
  ],
  
  "verification_result": {
    "change_minimization_passed": true,
    "perceptual_hash_match": 0.994
  }
}
```

## LLM-Specific Considerations

Since text operations are all LLM-based:

### Temperature Strategy
- `TEXT_LITERAL_TRANSLATE`: 0
- `TEXT_LIGHT_LOCALIZE`: 0.3
- `TEXT_TRANSCREATE` (candidates): 0.7
- `TEXT_TRANSCREATE` (refinement): 0.2
- `COMPLIANCE_VISION_CHECK`: 0
- `SOURCE_ASSET_PARSE`: 0

### Response Format
Always request structured JSON via response_format.

### Translation Memory
- Cache key: `hash(source_text + use_case + target_market + brand_id + glossary_version)`
- Invalidate when glossary or brand version changes
- TM hits bypass LLM call entirely

### Token Budget
- Monitor post-assembly size
- If over budget, truncate in order: `FewShotLayer` → `SourceContextLayer` (non-critical parts)
- **Never truncate**: `SourceAnchorLayer`, `MarketComplianceLayer`, `BrandRestrictionsLayer`

## Market Audio Layer Examples (Veo 3.1)

For `VIDEO_AUDIO_REPLACE`:

```python
# DE
{
  "audio_prompt_additions": [
    "measured German voiceover in Hochdeutsch",
    "calm, observational tone",
    "NO crowd cheering or excited reactions",
    "professional sports commentary style"
  ]
}

# BR
{
  "audio_prompt_additions": [
    "warm Brazilian Portuguese voice (pt-BR, NOT pt-PT)",
    "moderate energy, friendly tone",
    "authentic Brazilian sports commentary style"
  ]
}

# UK
{
  "audio_prompt_additions": [
    "measured British English",
    "received pronunciation",
    "avoid overly excited delivery (UKGC compliance)"
  ]
}

# FR
{
  "audio_prompt_additions": [
    "clear French voiceover",
    "moderate energy",
    "neutral Parisian accent"
  ]
}

# US
{
  "audio_prompt_additions": [
    "American English sports commentator",
    "neutral professional tone",
    "no college/NCAA specific references"
  ]
}

# IN (V1 uses English)
{
  "audio_prompt_additions": [
    "Indian English accent (RP-compatible)",
    "clear enunciation",
    "cricket-aware vocabulary"
  ]
}

# PH
{
  "audio_prompt_additions": [
    "Filipino English or Tagalog as specified",
    "warm, conversational",
    "basketball-aware vocabulary"
  ]
}

# NG
{
  "audio_prompt_additions": [
    "Nigerian English (en-NG) accent, clear and confident",
    "energetic but measured — avoid hype bordering on guarantee",
    "football-first vocabulary (Premier League, AFCON, Super Eagles references OK; avoid real active Super Eagles player names unless licensed)",
    "no language implying guaranteed winnings or easy money (LSLGA/NLRC)"
  ]
}
```

## Multimodal LLM for Source Parsing

Structured output for `SOURCE_ASSET_PARSE`:

```json
{
  "text_units": [
    {
      "content": "Bet on the Game",
      "role": "cta",
      "location": { "type": "image_region", "bbox": [x,y,w,h] },
      "language": "en",
      "font_info": {
        "family": "bold sans-serif",
        "size_relative": "large",
        "color": "#FFFFFF",
        "style": "bold"
      },
      "confidence": 0.95
    },
    {
      "content": "18+ T&Cs Apply. BeGambleAware.org",
      "role": "legal",
      "location": {...},
      "language": "en",
      "font_info": {"size_relative": "small"},
      "confidence": 0.82
    }
  ],
  "visual_units": [
    {
      "description": "Young adult male watching football on phone, excited expression",
      "element_type": "person",
      "location": {...},
      "detected_attributes": {
        "estimated_age": 28,
        "cultural_markers": ["American football jersey"],
        "risk_flags": []
      }
    }
  ],
  "compliance_flags": [
    {
      "type": "age_label_present",
      "status": "present",
      "location": {...}
    },
    {
      "type": "rg_logo_present",
      "status": "missing",
      "severity": "info"
    }
  ],
  "parse_warnings": [
    "Small legal text may have reduced accuracy"
  ]
}
```

## Testing Strategy

### Unit Tests
- Each layer tested in isolation
- Each layer handles missing optional inputs

### Integration Tests  
- Full assembly for every use case × market combination
- Golden file tests: snapshot expected assembly output

### Source Anchor Tests (Critical)
- For every edit use case, verify SourceAnchorLayer always applied
- Regression test: run 50 historical edits, ensure preservation hash still matches

### Token Budget Tests
- Measure assembled prompt size per use case
- Alert if approaching model limits

## V1 Rollout

### Phase 3 (AI Integration)
- `SOURCE_ASSET_PARSE`
- `TEXT_LITERAL_TRANSLATE`, `TEXT_LIGHT_LOCALIZE`, `TEXT_TRANSCREATE`
- `IMAGE_TEXT_REPLACE`, `IMAGE_ELEMENT_REPLACE`

### Phase 4 (Extended AI + Compliance)
- `VIDEO_TEXT_REPLACE`, `VIDEO_AUDIO_REPLACE`
- `IMAGE_ELEMENT_REMOVE`
- `COMPLIANCE_VISION_CHECK`, `COMPLIANCE_EXPLANATION`
- `ASSET_TAGGING`
