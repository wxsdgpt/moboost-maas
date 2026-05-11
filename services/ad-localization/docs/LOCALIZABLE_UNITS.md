# Localizable Units (LU) — Core Concept

## Overview

A **Localizable Unit (LU)** is an atomic piece of the source asset that can have a localization strategy applied to it. The entire product experience revolves around this concept.

**Parse → Strategize → Apply → Assemble**

1. **Parse**: System decomposes source asset into LUs
2. **Strategize**: User (with smart defaults) picks a strategy per LU per market
3. **Apply**: System executes the strategy (layer swap / AI edit / LLM translate)
4. **Assemble**: Localized LUs reassembled into final per-market asset, with compliance overlay

## LU Types

### 1. Text LU

A segment of text from the source. Sources include:
- PSD text layers (highest fidelity)
- Multimodal LLM extraction from flattened images
- Video overlay text (detected via frame analysis)
- Video subtitles or captions
- Asset metadata (title, description, tags)

Each Text LU has:
```typescript
TextLU {
  id: UUID
  source_content: string
  source_language: string
  
  source_location: {
    type: "psd_layer" | "image_region" | "video_region" | "metadata"
    reference: string          // layer ID, bounding box, time range, field name
    font_info?: FontInfo       // preserved for replacement
    style_info?: StyleInfo     // color, weight, effects
  }
  
  semantic_role: enum          // "cta" | "headline" | "body" | "legal" | 
                               // "odds" | "brand_name" | "product_name" | 
                               // "tagline" | "disclaimer" | "decorative"
  
  max_length_constraint?: int  // for text that must fit in a space
  is_locked: boolean           // e.g., legal text often locked to literal
  default_strategy: TextStrategy
  confidence: number           // parser's confidence in detection
}
```

### 2. Visual LU

A visual element detected in the source:

```typescript
VisualLU {
  id: UUID
  element_type: enum          // "person" | "scene_background" | "prop" | 
                              // "sports_element" | "logo" | "lifestyle_object"
  
  source_location: {
    type: "psd_layer" | "image_region" | "video_region"
    reference: string
    mask_url?: string          // for AI editing, precise region
  }
  
  detected_attributes: {       // from multimodal LLM
    description: string
    estimated_age?: number     // for persons
    cultural_markers?: string[] // "American football", "British pub"
    sports_context?: string
    risk_flags?: string[]      // compliance concerns
  }
  
  is_modifiable: boolean       // some elements are structural, cannot be replaced
  default_strategy: VisualStrategy
}
```

### 3. Audio LU

Audio component in video source:

```typescript
AudioLU {
  id: UUID
  audio_type: enum             // "dialogue" | "voiceover" | "music" | "sfx" | "ambient"
  
  source_location: {
    time_range: [number, number]   // start-end in seconds
    channel?: int                  // stereo channel if separated
    transcript?: string            // for dialogue/voiceover
    source_language?: string
  }
  
  detected_attributes: {
    emotion_intensity: number      // compliance check (DE cap)
    voice_gender?: string
    pace?: "slow" | "medium" | "fast"
  }
  
  default_strategy: AudioStrategy
}
```

### 4. Compliance LU (auto, not user-selectable)

Elements that must exist per target market. System auto-injects these:

```typescript
ComplianceLU {
  id: UUID
  element_type: enum          // "age_label" | "rg_logo" | "rg_hotline" | 
                              // "license_number" | "mandatory_warning" | 
                              // "tcs_link"
  
  market_specific_content: {
    [market: string]: {
      text?: string            // e.g., "Spielen kann süchtig machen..."
      asset_url?: string       // e.g., BeGambleAware logo
      required_size_ratio?: number
      required_position?: string
    }
  }
  
  placement_strategy: enum    // "user_choosable_within_constraints" | "fixed"
  // User can move it around as long as compliance is maintained
}
```

## Localization Strategies

### Text Strategies

| Strategy | What it does | AI call | Default for |
|---|---|---|---|
| `keep_original` | Use source text as-is | None | Brand names, product names |
| `literal_translate` | Faithful translation | LLM (low temp) | Legal text, T&Cs, disclaimers |
| `light_localize` | Translate + idiomatic adjustment | LLM (low temp + culture layer) | CTAs, buttons, short headlines |
| `transcreate` | Creative rewrite for target market | LLM (higher temp + brand voice + market culture) | Slogans, emotional headlines |
| `user_provided` | User supplies target translation | None | Any, user override |

### Visual Strategies

| Strategy | What it does | AI call | Default for |
|---|---|---|---|
| `keep_original` | Preserve source element | None | Most visual elements |
| `replace_for_compliance` | Replace only if market compliance requires | Conditional (Nano Banana) | Celebrities, real team logos, minors |
| `localize_culturally` | Replace with target market cultural version | Nano Banana | Sports elements, cultural scenes (only if user opts in) |
| `custom_replace` | Replace per user specification | Nano Banana + user prompt | When user has specific target in mind |

### Audio Strategies (Video only)

| Strategy | What it does | AI call | Default for |
|---|---|---|---|
| `keep_original` | Original audio unchanged | None | Music-only videos |
| `add_subtitles_only` | Original audio + target language subtitles | LLM (translate) + compositing | V1 default for dialogue |
| `replace_dialogue` | Replace with target language voiceover | Veo 3.1 audio regen or TTS | User opts in for full localization |
| `keep_with_subtitles` | Both original audio and subtitles | LLM + compositing | Accessibility |

### Compliance LU Handling

Not user-selectable. System rules:
- Always inject required compliance elements for the target market
- User can adjust visual placement within allowed constraints
- Cannot be removed or modified
- Must pass compliance check before export

## Smart Default Strategy Resolution

For each LU, the system picks a default strategy based on:

1. **Semantic role** of the LU
2. **Target market** regulations
3. **User's historical preferences** (in V2)
4. **Brand-level lock rules** (e.g., "brand name always kept original")

Example default resolver:
```python
def resolve_default_text_strategy(lu: TextLU, market: str, brand: Brand) -> TextStrategy:
    # Brand-level locks
    if lu.semantic_role in ["brand_name"] and brand.lock_brand_name:
        return "keep_original"
    if lu.semantic_role in ["product_name"] and brand.has_product_glossary(lu.content):
        return "keep_original"
    
    # Legal text is always literal
    if lu.semantic_role in ["legal", "disclaimer"]:
        return "literal_translate"
    
    # Odds must be converted (US format differs from EU)
    if lu.semantic_role == "odds":
        return "literal_translate"  # with format conversion
    
    # Short creative text is transcreated for high-risk markets
    if lu.semantic_role in ["headline", "tagline"] and market in ["DE", "UK", "FR"]:
        return "transcreate"
    
    # Default for CTAs and short copy
    if lu.semantic_role in ["cta", "button"]:
        return "light_localize"
    
    return "literal_translate"
```

## Source Asset Parser

The parser is one of the most critical V1 components. Responsibilities:

### For PSD/AI Files
- Read layer structure (use `psd-tools` library or similar)
- Extract text layers → Text LUs with font/style preserved
- Identify image layers → potential Visual LUs
- Preserve layer hierarchy and effects for reassembly

### For Flattened Images (PNG/JPG)
- Send to multimodal LLM (Gemini) with structured prompt
- LLM returns:
  - Text elements with bounding boxes and role classification
  - Visual elements with descriptions
  - Compliance flags (missing age label, etc.)
- System builds LUs from LLM output

### For Videos (MP4)
- Extract frames at key intervals
- Run frame analysis for overlay text detection
- Extract audio, run dialogue transcription (Whisper or Gemini)
- Detect scene boundaries
- Build Video Text LUs, Audio LUs, Visual LUs with time ranges

### Parser Output

```typescript
ParsedAsset {
  source_asset_id: UUID
  source_type: "psd" | "ai" | "png" | "jpg" | "mp4"
  has_editable_layers: boolean
  
  localizable_units: LU[]
  compliance_units: ComplianceLU[]
  
  structural_metadata: {
    dimensions: { width, height, duration? }
    frame_rate?: number
    layer_tree?: LayerNode         // for PSD
    audio_channels?: number
  }
  
  parse_confidence: number
  parse_warnings: string[]         // e.g., "small text may not be captured"
}
```

## Strategy Application Pipeline

For each LU and each target market, the pipeline runs:

```python
def apply_strategy(
    lu: LU, 
    strategy: Strategy, 
    market: str, 
    source_asset: ParsedAsset
) -> LocalizedUnit:
    # 1. Determine processing path
    if isinstance(lu, TextLU):
        if lu.source_location.type == "psd_layer":
            return apply_psd_text(lu, strategy, market)
        elif lu.source_location.type == "image_region":
            return apply_image_text_edit(lu, strategy, market, source_asset)
        elif lu.source_location.type == "video_region":
            return apply_video_text_edit(lu, strategy, market, source_asset)
    
    if isinstance(lu, VisualLU):
        if strategy == "keep_original":
            return LocalizedUnit(unchanged=True)
        return apply_visual_edit(lu, strategy, market, source_asset)
    
    if isinstance(lu, AudioLU):
        return apply_audio_localization(lu, strategy, market, source_asset)
```

### PSD Text Replacement (Preferred Path)

When source is PSD and text layers exist:
1. Find the original text layer
2. Call LLM with Prompt Assembly for translation/transcreation
3. Replace layer text, preserving font/style
4. No image generation needed — deterministic and fast

### Image Text Edit (AI Path)

When source is flattened:
1. Get LU's mask/region
2. Call LLM for translated text
3. Call Nano Banana with:
   - Source image
   - Mask for region
   - Target text
   - Anchor layer prompt: "replace text in masked region with '[new text]', preserve font style, perspective, lighting"
4. Apply edit
5. Verify with perceptual hash: untouched regions must match source

### Visual Element Edit (AI Path)

1. Get element mask
2. Call Nano Banana with:
   - Source image
   - Element mask
   - Replacement description (from user or cultural defaults)
   - Preservation directives for surrounding context
3. Verify change is bounded to mask

### Video Audio Replacement

1. Extract video (silent)
2. Translate dialogue via LLM
3. Use Veo 3.1 audio regen (if supported for this specific edit) OR
4. Fall back to extracting original video, compositing with new audio

### Video Text Edit

1. Identify frames containing the text
2. For each affected frame range, treat as image text edit
3. Re-compose video with edited frames
4. Verify consistency across frames

## Per-Market Strategy Matrix

The UI's core artifact is this matrix:

```
Unit                        │ US  │ UK  │ PH  │ IN  │ BR  │ FR  │ DE  │ NG  │
────────────────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
Text: "Bet on the Game"     │ LL  │ LL  │ KO  │ KO  │ LL  │ TC  │ TC  │ LL  │
Text: "T&Cs Apply. 18+"     │ LT  │ LT  │ LT  │ LT  │ LT  │ LT  │ LT  │ LT  │
Text: "Odds 2.5"            │ LT* │ LT  │ LT  │ LT  │ LT  │ LT  │ BLOCK│ LT  │
Visual: Football fan (US)   │ KO  │ RC  │ KO  │ KO  │ LC  │ LC  │ RC  │ LC  │
Audio: English commentary   │ KO  │ KO  │ SO  │ SO  │ RD  │ RD  │ RD  │ KO  │
Compliance elements         │ AUTO│ AUTO│ AUTO│ AUTO│ AUTO│ AUTO│ AUTO│ AUTO│

LL=light_localize, LT=literal, TC=transcreate, KO=keep_original
RC=replace_for_compliance, LC=localize_culturally, SO=subtitles_only, RD=replace_dialogue
*odds format: US uses +150/-200, EU uses 2.5, must convert
BLOCK=DE prohibits specific odds display
NG notes: English content (KO audio), visual context switches from American football to
          association football / soccer (LC). US and NG both use PER_STATE_OPERATING —
          cells here aggregate across their sub-markets; individual states may differ
          (e.g. US-TN forces TC on CTA due to 'free bet' ban).
```

Users can change cells in this matrix before generation.

## Change Minimization Verification

After AI-edited regions are produced, verify:

```python
def verify_minimization(source: Image, edited: Image, modified_regions: list[Mask]):
    """
    Ensure only the intended regions changed.
    """
    source_hash = perceptual_hash_regions(source, exclude=modified_regions)
    edited_hash = perceptual_hash_regions(edited, exclude=modified_regions)
    
    if source_hash != edited_hash:
        raise ChangeBleedError(
            "AI edit modified regions beyond the target. Retry with tighter mask."
        )
```

This catches AI "scope creep" where Nano Banana changes more than requested.

## Strategy Presets (V1.5+)

Users can save common strategy combinations:
- "Legal-safe preset": everything `literal_translate` or `keep_original`
- "Full localization": `transcreate` for creative, `localize_culturally` for visuals
- "Subtitle-only video": all audio `add_subtitles_only`

Brands can have default presets; campaigns can override.

## V1 Scope for LU System

### Required
- Text LU parsing (PSD + multimodal LLM for flattened)
- Visual LU parsing (multimodal LLM)
- Audio LU parsing (Whisper/Gemini transcript)
- Compliance LU auto-injection (all 8 markets)
- All 5 text strategies, 4 visual strategies, 4 audio strategies
- Smart default resolver
- Per-market strategy matrix UI
- Change minimization verification

### Deferred to V1.5+
- Strategy presets
- User preference learning
- Advanced PSD features (smart objects, adjustment layers)
- Animated GIF as distinct LU type
- HTML5 creative LU parsing
