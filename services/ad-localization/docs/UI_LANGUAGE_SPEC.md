# UI Language Specification

## Core Rule

**The entire system UI is in English only.** All user-facing system text (menus, buttons, forms, labels, tooltips, error messages, email notifications, PDF reports) must be in English.

## Three Language Layers (Must Be Separated)

The system handles three distinct language contexts. Do not mix them.

### Layer 1: System UI (English Only)
Everything that is part of the application interface itself.

Examples:
- Menu items: "Dashboard", "Assets", "Compliance", "Workflow"
- Buttons: "Upload", "Generate", "Approve", "Reject", "Export"
- Form labels: "Target Market", "Brand", "Campaign"
- Status indicators: "Pending Review", "Approved", "Rejected"
- Error messages: "Generation failed. Please retry."
- Tooltips: "This asset requires legal review for DE market"
- Email notifications to users
- Compliance report headings and structure

### Layer 2: Content Being Processed (Multi-language)
The actual creative content the system is localizing. This must be displayed in the original/target language, never translated for the UI.

Examples:
- OCR-extracted text from German creative: displayed as-is in German
- Translated copy for Brazilian market: displayed in pt-BR
- Generated French video subtitles: displayed in French
- Transcreation candidates: displayed in target language

### Layer 3: Regulatory References (Original Language)
Legal and compliance citations. Keep in original language for legal accuracy.

Examples:
- German regulation: "GlüStV §5 Abs. 3" (do not translate)
- French warning text: "Jouer comporte des risques..." (do not translate)
- UK regulation reference: "CAP Code Rule 16.3.12" (already English)
- Brazilian law: "Lei 14.790/2023" (do not translate)

## Display Pattern Examples

### Compliance Finding Display
```
[System UI in English]        [Content in Original Language]

Severity:    BLOCKING          
Rule:        Required warning missing
Market:      Germany (DE)
Reference:   GlüStV §5 Abs. 3    ← Original German legal reference
Expected:    "Spielen kann süchtig machen. Hilfe unter www.buwei.de"
                                  ← Original German warning text (not translated)
Suggested Fix: Add the required German warning text to the bottom of the video
```

### Transcreation Review Display
```
[System UI in English]

Source Language: English (US)
Target Market:   Brazil (BR)
Target Language: Portuguese (pt-BR)

Original Copy:       "Place your bet now!"
Candidate 1 (pt-BR): "Faça sua aposta agora!"      ← Target language
Candidate 2 (pt-BR): "Aposte já!"                    ← Target language
Candidate 3 (pt-BR): "Hora de apostar!"              ← Target language

[Approve] [Reject] [Request Revision]    ← UI buttons in English
```

### Forbidden Word Detection Display
```
[System UI in English]

Issue:       Forbidden word detected
Market:      United Kingdom (UK)
Rule:        UKGC CAP Code - Risk-free claims prohibited
Location:    Line 3 of headline copy
Detected:    "risk-free bet"                          ← Actual detected content
Suggestion:  Replace with "qualifying bet" or similar
```

## Implementation Notes

### Frontend i18n Setup
Even though we only support English UI in V1, structure the frontend with i18n from day one:
- Use a library like `next-intl`, `react-i18next`, or `next-i18next`
- All UI strings in a messages file (e.g., `en.json`)
- Do NOT hardcode any user-facing text in components
- This makes future expansion (if ever needed) trivial

### Why i18n Even for English-only?
1. Forces clean separation of UI text from code
2. Enables easy terminology consistency reviews
3. Allows non-developers (PM, designers) to edit UI copy
4. Future-proofs the codebase

### Date, Number, Currency Formatting
Use English conventions consistently:
- Dates: `MM/DD/YYYY` or `DD MMM YYYY` (choose one, stick to it; recommend ISO `YYYY-MM-DD` for technical displays)
- Numbers: `1,234.56` (comma thousands, period decimal)
- Currency: USD as default. For market-specific amounts, show native currency with USD equivalent: "€100 (≈ $108)", "₦50,000 (≈ $30)", "R$150 (≈ $28)".
- Supported currencies: USD, GBP, EUR, BRL, INR, PHP, **NGN (Nigerian Naira, symbol ₦)**
- Times: 24-hour format for technical logs, 12-hour with AM/PM for user-facing

### Market Names Display
Always use English names for markets in UI:
- "United States" not "USA" or "Estados Unidos"
- "United Kingdom" not "UK" (in full text; abbreviation OK in tight spaces)
- "Germany" not "Deutschland"
- "France" not "France" (happens to be same)
- "Brazil" not "Brasil"
- "India" not "Bharat"
- "Philippines" not "Pilipinas"
- "Nigeria" not "Naijiriya" or local translations

Use ISO codes in technical fields: `US`, `UK` (or `GB`), `DE`, `FR`, `BR`, `IN`, `PH`, `NG`

### Language Codes Display
Use BCP 47 language tags:
- `en-US`, `en-GB`, `en-NG` (Nigerian English), `en-IN` (Indian English), `en-PH` (Philippine English)
- `de-DE`
- `fr-FR`
- `pt-BR` (not `pt` or `pt-PT`)
- `hi-IN`, `ta-IN` (for future Indian languages)
- `fil-PH` or `tl-PH` (Filipino/Tagalog, for future)
- `yo-NG`, `ha-NG`, `ig-NG` (Yoruba / Hausa / Igbo — V2)

### Content Preview Components
When displaying multi-language content, use clear visual separation:
- Label the language: `[pt-BR]` badge next to content
- Use `lang` HTML attribute for accessibility: `<p lang="de">Spielen kann...</p>`
- Right-to-left support structure ready (even if no RTL markets in V1)

## Don'ts

- Do not translate market regulation names or legal terms in UI
- Do not translate the actual creative content being processed
- Do not translate user-generated content (comments, notes) — display as entered
- Do not auto-translate user names or brand names
- Do not localize numerical values unless explicitly a formatting decision

## Accessibility

English UI must meet WCAG 2.1 AA:
- Clear, simple English (target B2 reading level for non-native speakers)
- Avoid idioms and cultural references in UI copy
- Screen reader compatible with proper `lang` attributes for mixed-language content
- Consistent terminology throughout (maintain a UI glossary)

## UI Copy Style Guide

- Use sentence case for buttons and labels: "Upload asset" not "Upload Asset"
- Use title case for page titles: "Compliance Review Dashboard"
- Keep button text short (1-3 words)
- Use active voice: "Generate variant" not "Variant will be generated"
- Be specific in errors: "File exceeds 50MB limit" not "Invalid file"
- Avoid jargon where possible, but iGaming industry terms are OK (GGR, RTP, T&Cs)
