# iGaming Ad Creative Localization System

## Project Overview

An internal tool for iGaming marketing teams to **localize** existing ad creatives (text, images, videos) across 8 markets (US, UK, PH, IN, BR, FR, DE, NG), with a focus on sports betting.

**This is a localization tool, not a creative generation tool.** Users upload finished source assets; the system produces per-market localized versions while preserving the source's visual/creative intent.

## Product Positioning (Critical)

- **Text in → Text out** (same content, localized per market)
- **Image in → Image out** (same composition, localized elements)
- **Video in → Video out** (same footage/duration/aspect ratio/bitrate, localized text/audio)

The system does NOT generate new creative from scratch. AI is used for editing and modification, not creation.

**Input technical properties equal output technical properties.** If the input is 30s 16:9 MP4 at 8Mbps, every output is 30s 16:9 MP4 at 8Mbps — what differs is only market-specific content (language, audio, compliance overlays).

Aspect ratio conversion, bitrate/format variations, and duration cuts are NOT localization — they're delivery operations handled by design/ops workflows, not by this system.

## Core User Experience

```
Upload source asset
    ↓
System parses asset into Localizable Units (text, visual, audio elements)
    ↓
User selects localization strategy per unit (with smart defaults)
    ↓
System applies to all 8 markets in batch (with per-market overrides allowed)
    ↓
User sees final deliverable only (processing details hidden but audited)
    ↓
Review workflow → Approved → Distributed
```

## Required Reading Before Any Code

Read in this order:

1. `docs/CLAUDE_CODE_GUIDE.md` — Development phases and constraints
2. `docs/PROJECT.md` — Background, users, markets, principles
3. `docs/UI_LANGUAGE_SPEC.md` — UI is English-only, content is multi-language
4. `docs/LOCALIZABLE_UNITS.md` — **Core concept**: how assets are decomposed and strategies applied
5. `docs/SUB_MARKETS.md` — **Critical**: US state-level and IN state-level handling (very different models)
6. `docs/SUB_MARKET_INTEGRATION.md` — **Critical**: how sub-markets flow through the entire pipeline
7. `docs/MVP_SCOPE.md` — V1 scope
8. `docs/ARCHITECTURE.md` — System layers and pipelines
9. `docs/PROMPT_ASSEMBLY.md` — Unified AI prompt layering
10. `docs/COMPLIANCE_GOVERNANCE.md` — **Critical**: rule management, override model, review workflow
11. `docs/DATA_MODELS.md` — Data structures
12. `docs/COMPLIANCE_RULES.md` — Per-market regulatory rules
13. `docs/BRAND_AND_GLOSSARY.md` — Brand restrictions and terminology

## Critical Constraints (Do Not Violate)

1. **Localization, not generation**: Preserve source asset intent. AI edits, it does not create.

2. **PSD-first, AI-backup**: When source is PSD/AI with editable layers, prefer deterministic layer replacement. Use AI (Nano Banana) only when source is flattened or layers cannot satisfy the requirement.

3. **Change Minimization**: Every AI-edited region must be justified. Untouched regions must be bit-identical to source (use perceptual hash verification).

4. **UI Language**: English only. Content and regulatory references in their original languages. See `UI_LANGUAGE_SPEC.md`.

5. **Compliance Is Advisory, Not Blocking**: All compliance findings are warnings. System never prevents submission. Marketing/ad ops owns final decision. Full audit trail preserved. See `COMPLIANCE_GOVERNANCE.md`.

6. **Two-Layer Rules**: System default rules (dev-maintained) + Brand overrides (brand admin managed). Brand admins can tighten AND relax system defaults with full logging. No legal role in the system.

7. **Mandatory Confirmation**: Every asset requires ad ops confirmation click before distribution, even with zero compliance findings.

8. **Compliance Elements Are Deterministic**: Responsible gambling logos, license numbers, mandatory warnings rendered via code (Pillow/FFmpeg), never via AI.

9. **All AI Calls Are Logged**: `AIGenerationLog` table records every call for audit. Full prompt assembly trace preserved.

10. **Rules Are Versioned**: Approved assets snapshot the effective rule set (system + brand overrides) at confirmation time.

11. **Async by Default**: Video/image editing jobs use task queues. No blocking requests.

12. **i18n From Day One**: `next-intl` or similar, even for English-only V1.

13. **LLM-Only for Text**: No DeepL/Google Translate. All text operations via LLM + Prompt Assembly.

14. **No OCR**: Image text extraction uses multimodal LLM. Validate small-text accuracy in testing.

15. **Veo 3.1 Native Audio + Extend**: Video dialogue/audio uses Veo's native capabilities (not separate TTS). Native clips are 4/6/8s; Video Extend API can reach 148s (8 + 20×7), with Google auto-merging into a single file. No manual concatenation needed. Watch for quality degradation past 4-5 extensions; extend may be Preview-only (supplier risk).

16. **User Sees Final Output Only**: UI shows deliverables, not processing steps. But backend stores full trace for audit.

17. **German Market Is Special**: DE assets need time-window metadata (21:00-06:00), odds display detection, calm audio tone.

18. **US Is NOT One Market**: US has ~38 legal sports betting states, each with distinct regulations. Each state is a sub-market producing its own `LocalizedAsset`. Blocked states (CA, TX, UT, HI, etc.) are protected via distribution metadata. **V1 covers all ~38 active states**, with rule pack content prioritized by Tier (NJ/PA/NY/MI/IL/MA/OH/CO first). See `SUB_MARKETS.md`.

19. **NG Uses Per-State Model Like US**: Post the November 2024 Supreme Court ruling, Nigerian gaming is regulated at the state level (NLRC retains only FCT jurisdiction). NG uses the same `PER_STATE_OPERATING` handler as US. V1 priority sub-markets: **NG-LA (Lagos, LSLGA)** and **NG-FCT (Federal Capital Territory, NLRC)**. Other states are data-model placeholders with minimal rule packs. Content language: English (`en-NG`). Currency: NGN. See `SUB_MARKETS.md`.

20. **IN Uses Blocklist Model**: One India asset, state-level blocklist applied at distribution time. Blocked states include TN, AP, TS, OR, AS, NL. Karnataka is volatile, defaults to blocked. ASCI compliance applies nationally. See `SUB_MARKETS.md`.

21. **UK Has Two Regulators**: Great Britain (England, Scotland, Wales) under UKGC / Gambling Act 2005. Northern Ireland under separate BGLA Order. Default UK asset = UK-GB only. NI requires brand opt-in.

22. **BR Is Federal Today But Evolving**: SPA federal license covers all of Brazil in V1. Data model prepared for state-level expansion (Rio, São Paulo developing state rules). Monitor quarterly.

23. **DE, FR, PH Are Unified Federal Markets**: GlüStV 2021/GGL (DE), ANJ (FR), PAGCOR (PH) — all single-market. No sub-market handling.

24. **LocalizationTarget Is Atomic**: Every pipeline component accepts `LocalizationTarget(market, sub_market?)` — never raw market strings. 5 sub-market models are parameterized (`per_state_operating`, `blocklist`, `optional_dual`, `federal_only`, `federal_placeholder`). `PER_STATE_OPERATING` is shared between US and NG — same handler, different sub-market tables. Avoid scattered `if market == "US"` branches. See `SUB_MARKET_INTEGRATION.md`.

## Localization Strategy Matrix

For every Localizable Unit, the user picks a strategy. Defaults are market-aware.

**Text strategies**: `keep_original` / `literal_translate` / `light_localize` / `transcreate` / `user_provided`

**Visual strategies**: `keep_original` / `replace_for_compliance` / `localize_culturally` / `custom_replace`

**Audio strategies**: `keep_original` / `add_subtitles_only` / `replace_dialogue` / `keep_with_subtitles`

See `LOCALIZABLE_UNITS.md` for full details.

## Before You Start Coding

After reading all docs, respond with:

1. Your understanding of the project (3-5 sentences)
2. Tech stack recommendation with justification
3. Phase 1 Week 1 task breakdown
4. Any ambiguities or contradictions you found
5. Questions before coding

**Do not write code until the user confirms your plan.**

## Development Phases

- **Phase 1** (2 weeks): Scaffolding, auth, database, S3, i18n skeleton
- **Phase 2** (3-4 weeks): Source asset parsing, unit detection, strategy UI, PSD layer handling
- **Phase 3** (3-4 weeks): AI integrations (Nano Banana for edit, Veo 3.1 for video, LLM for text), Prompt Assembly service
- **Phase 4** (3-4 weeks): Compliance engine, deterministic overlays, audit trail
- **Phase 5** (2-3 weeks): Review workflow, export adapters, deployment

## Communication Protocol

Before deciding these independently, ask the user:
- Adding or modifying **system default** compliance rules
- Adding new markets or languages
- Changing review workflow structure
- Setting default AI parameters
- Changing the Localizable Unit taxonomy
- Changing the roles/permissions model
- Changing the reason-required default configuration

## Security

- Object storage encryption at rest
- Audit log table is append-only
- Compliance rule changes require dual review
- API keys in secrets manager
- Follow OWASP top 10
