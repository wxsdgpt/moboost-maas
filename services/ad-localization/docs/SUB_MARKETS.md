# Sub-Market Support: US States and IN States

## Overview

Of the 7 V1 markets, **sub-market handling varies significantly**. This document defines which markets need sub-market models and how they differ.

## Market-by-Market Sub-Market Analysis

| Market | Sub-market needed? | Model | Priority |
|---|---|---|---|
| US | **Yes, mandatory** | Per-state operating (positive list) | V1 must-have, full 38-state coverage |
| NG | **Yes, mandatory** | Per-state operating (post-2024 Supreme Court ruling) | V1 must-have, Lagos + FCT priority |
| IN | **Yes, mandatory** | Blocklist at distribution | V1 must-have |
| UK | **Recommended** | Simple two-sub-market: GB + NI | V1 nice-to-have |
| BR | **Data model only** | Federal-only today, schema ready for state expansion | V1 placeholder |
| DE | No | Federal unified via GlüStV 2021 | — |
| FR | No | Federal unified via ANJ | — |
| PH | No | Federal unified via PAGCOR | — |

### Why each decision

- **US**: 38+ states each legislated independently after PASPA repeal (2018). Each state is its own operating market.
- **NG**: November 2024 Nigerian Supreme Court ruling devolved gaming regulation to individual states. NLRC's licensing authority is now limited to the Federal Capital Territory (FCT). Each state (Lagos via LSLGA, Oyo State Gaming Board, etc.) issues its own license. Structurally mirrors US model.
- **IN**: National ASCI rules apply, but individual states ban or allow at their discretion. One asset, state-level geo-fence.
- **UK**: Gambling Act 2005 covers England/Scotland/Wales (Great Britain) under UKGC. **Northern Ireland has its own separate law** (Betting, Gaming, Lotteries and Amusements NI Order) — same country, different regulator.
- **BR**: Federal SPA license, but states (Rio de Janeiro, São Paulo, etc.) are starting to pass state-level rules. Monitor for V2 expansion.
- **DE**: GlüStV 2021 + GGL (operational 2023) unified all 16 Bundesländer for online gambling/sports betting advertising.
- **FR**: ANJ is a single national regulator. DROMs (overseas territories) are legally part of France, same rules.
- **PH**: PAGCOR is a single national regulator.

## US Sub-Market Model (Per-State Operating)

### Structure

```
Market: US
├── Regulatory layer: FTC federal
├── Active sub-markets (~38 states with legal online sports betting):
│   ├── US-NJ, US-PA, US-NY, US-MA, US-MI, US-IL, US-OH, US-CO, ...
└── Blocked sub-markets (states where sports betting is illegal or restricted):
    ├── US-CA, US-TX, US-UT, US-HI, US-AL, US-AK, ...
```

### Data Model

```typescript
SubMarket {
  id: "US-NJ"
  parent_market: "US"
  display_name: "New Jersey"
  state_code: "NJ"
  
  operational_status: "active" | "blocked" | "limited" | "tribal_only"
  legalization_date: date | null
  
  regulatory_body: "NJ Division of Gaming Enforcement"
  
  // Sub-market specific attributes
  min_age: 21
  license_number_format: string
  
  // Each sub-market has its own compliance rule pack
  compliance_rule_pack_id: UUID
  
  // Sub-market specific responsible gambling resources
  rg_hotline: "1-800-GAMBLER"
  rg_logo_url: string
  
  // Mandatory disclaimers specific to this state
  mandatory_disclaimers: [
    { text: string, placement: string, language: string }
  ]
  
  // Attributes affecting prompt assembly
  prompt_overrides: {
    forbidden_terms: string[]       // e.g., TN forbids "free bet"
    required_tone_adjustments: string[]
  }
  
  notes: string                     // human-readable context
}
```

### UI Behavior

When user selects target markets:

```
Target Markets:
  ☐ United States (US)       [▼ Expand]
    ☑ New Jersey (NJ)        [Active]
    ☑ Pennsylvania (PA)      [Active]
    ☑ New York (NY)          [Active]
    ☑ Michigan (MI)          [Active]
    ☑ Massachusetts (MA)     [Active - submission review required]
    ...
    ☐ California (CA)        [Blocked - cannot distribute]
    ☐ Texas (TX)             [Blocked]
    
  [Select all active states] [Only brand-operated states]
  
  ☑ United Kingdom (UK)
  ☑ Germany (DE)
  ...
```

Default selection: sub-markets where the brand has declared operations (brand config stores operated_in_states).

### Processing Behavior

Each selected sub-market is treated as an independent localization target:

- Separate `LocalizedAsset` record per sub-market
- Separate compliance check (each state's rule pack applied)
- Separate deterministic compliance overlay (each state's disclaimers)
- Potentially identical visual output but different metadata

### Why Separate LocalizedAsset per State

Looks wasteful at first, but required because:
1. **Regulatory audit**: "Show me what we distributed in NJ on date X" needs a distinct record
2. **State-specific overlays**: NJ uses "1-800-GAMBLER", different state might use state-specific hotline
3. **Distribution metadata**: Each state has distinct geo-fencing requirements
4. **Independent confirmation**: Ad ops might approve NJ but want to re-review NY

### Compliance Rule Packs per State

Each active state gets a `ComplianceRulePack` containing:
- State-specific forbidden words/phrases
- State-specific mandatory disclaimers
- State-specific age label (21+ or 18+)
- State-specific RG hotline
- State-specific license number format
- State-specific ad channel restrictions (e.g., no college campus proximity)

**V1 state coverage**: Full ~38-state coverage required. Tier 1 rule packs ship with authoritative review; Tier 2-4 rule packs ship with baseline rules (age limit, RG hotline, license format) plus state-specific additions discovered during content research.

### Priority States for V1 (Full 38-State Coverage)

V1 targets **full coverage of all ~38 US states with legal online sports betting**. Implementation order for rule pack content (data model and handlers support all states from Day 1):

**Tier 1 — Highest spend, most mature (implement first)**:
1. New Jersey (NJ) — largest, most mature
2. Pennsylvania (PA)
3. New York (NY)
4. Michigan (MI)
5. Illinois (IL)
6. Massachusetts (MA) — submission review flag required
7. Ohio (OH) — newest major market
8. Colorado (CO)

**Tier 2 — Significant markets**:
9. Tennessee (TN) — unique forbidden terms ("free bet" family)
10. Virginia (VA)
11. Indiana (IN)
12. Arizona (AZ)
13. Maryland (MD)
14. Connecticut (CT)
15. Iowa (IA)
16. Louisiana (LA)
17. Kansas (KS)
18. Kentucky (KY)

**Tier 3 — Smaller but active markets**:
19. West Virginia (WV)
20. Rhode Island (RI)
21. New Hampshire (NH)
22. Oregon (OR)
23. North Carolina (NC)
24. Vermont (VT)
25. Wyoming (WY)
26. Delaware (DE-state)
27. Nevada (NV)
28. Mississippi (MS) — retail only in most cases
29. Montana (MT)
30. North Dakota (ND)
31. District of Columbia (DC)
32. Maine (ME)

**Tier 4 — Limited, tribal, or restricted**:
33. Florida (FL) — limited, tribal-operated
34. Washington (WA) — tribal only
35. Arkansas (AR)
36. South Dakota (SD) — tribal
37. New Mexico (NM) — tribal
38. Wisconsin (WI) — tribal

All states get:
- `SubMarket` record with `operational_status` (active / blocked / limited / tribal_only)
- `ComplianceRulePack` (even if minimal) so compliance checks run for any state
- Deterministic overlay resources (RG hotline, license format, mandatory disclaimers)

Brands declare which states they operate in via `BrandUSOperations.operated_in_states`; only those states produce output variants during batch generation, but all states' rule packs are maintained system-wide.

### Blocked States Protection

If a source asset is uploaded and user tries to select a blocked state:
- UI shows blocked states as disabled with explanation
- System prevents distribution metadata from including blocked states
- Export file metadata explicitly blocklists CA, TX, UT, HI, etc.

This is a safety feature — even if media buyers accidentally target these states, the asset metadata will flag the issue.

## NG Sub-Market Model (Per-State Operating, post-2024 ruling)

### Context: the 2024 Supreme Court Ruling

Before November 2024, Nigerian gaming was regulated at both federal (NLRC, under the National Lottery Act 2005) and state levels, creating jurisdictional conflict. The **November 2024 Supreme Court ruling** (Attorney-General of Lagos State & Ors v Attorney-General of the Federation) devolved licensing authority to individual states. NLRC's power is now limited to the **Federal Capital Territory (FCT)** only.

Today, operators wishing to offer sports betting in any Nigerian state must obtain that state's license. Lagos (LSLGA) is the most commercially mature regulator; other states (Oyo, Rivers, etc.) have their own gaming boards at varying levels of maturity.

### Structure

```
Market: NG
├── Regulatory model: Per-state licensing (PER_STATE_OPERATING, same as US)
├── Active sub-markets (V1 priority):
│   ├── NG-LA (Lagos) — LSLGA, Lagos State Lotteries and Gaming Authority Law 2021
│   └── NG-FCT (Federal Capital Territory) — NLRC, National Lottery Act 2005
├── Data model reserved (V1 stub rule packs):
│   ├── NG-OY (Oyo) — Oyo State Gaming Board
│   ├── NG-RI (Rivers) — state gaming board
│   ├── NG-AN (Anambra), NG-KD (Kaduna), NG-KN (Kano), NG-EN (Enugu) — emerging
│   └── Other 30+ states — placeholder, operational_status="inactive"
```

### Data Model

Uses the same `SubMarket` schema as US. Nigerian-specific fields:

```typescript
SubMarket {
  id: "NG-LA"
  parent_market: "NG"
  display_name: "Lagos"
  region_code: "LA"

  operational_status: "active" | "limited" | "inactive"
  regulatory_body: "Lagos State Lotteries and Gaming Authority (LSLGA)"
  law_reference: "Lagos State Lotteries and Gaming Authority Law 2021"

  min_age: 18
  license_number_format: "LSLGA-\\d{5}"

  rg_hotline: "0800-GAMBLE-NG"   // or state-specific
  rg_logo_url: string

  mandatory_disclaimers: [
    { text: "18+ only. Play responsibly.", placement: "footer", language: "en" }
  ]

  prompt_overrides: {
    forbidden_terms: ["guaranteed win", "no risk", "easy money"]
    required_tone_adjustments: [
      "avoid targeting youth culture",
      "football references must be generic (avoid real active players)"
    ]
  }

  compliance_rule_pack_id: UUID
}
```

### UI Behavior

Same pattern as US sub-market selector:

```
Target Markets:
  ☐ Nigeria (NG)              [▼ Expand]
    ☑ Lagos (LA)              [Active — LSLGA]
    ☑ Federal Capital Territory (FCT) [Active — NLRC]
    ☐ Oyo (OY)                [Limited — rule pack minimal]
    ☐ Rivers (RI)             [Limited]
    ☐ Other states...         [Inactive — not supported in V1]

  [Select brand operation states] [Select Lagos + FCT (default)]
```

Default selection when brand has no declared NG operations: **Lagos + FCT** (covers the vast majority of Nigerian iGaming spend).

### Processing Behavior

Identical to US model:
- Separate `LocalizedAsset` record per selected Nigerian state
- Separate compliance check per state's rule pack
- Separate deterministic overlay (different license numbers, different RG hotlines where state-specific)

### Compliance Rule Pack Template (NG States)

Each active state gets a `ComplianceRulePack` with:
- Min age: 18
- State-specific license number format
- RG hotline (state-specific where available; else federal GambleAlert 0800 number)
- Mandatory "18+ only. Play responsibly." visible
- No ads targeting minors, near schools, or near religious institutions
- No endorsements by active Nigerian national team players (advisory, tightening)
- No guaranteed-win language
- Lagos-specific (LSLGA): 5% withholding tax disclosure if applicable (from Feb 2026)
- NLRC/FCT-specific: National Lottery Act compliance language

### Language and Currency

- **Content language**: English (primary for Nigerian iGaming ads)
- Nigerian Pidgin / Yoruba / Hausa / Igbo variants are used in some campaigns but V1 treats NG content as English (`en-NG` variant where distinguishable)
- Currency: **NGN (Nigerian Naira)** — shown for stakes, returns, bonuses
- Cost tracking shows NGN equivalent ("₦50,000 (≈ $30)") following the UI_LANGUAGE_SPEC rule

### Why Structurally Similar to US

The 2024 Supreme Court ruling made NG's licensing model very close to post-PASPA US:
- Federal level retains only narrow jurisdiction (FCT in NG, FTC in US)
- State-level licensing is where operators actually get authorized
- Each state has its own regulator, rules, and disclosure requirements
- Blocks on cross-state advertising require state-level geofencing at distribution

The `PER_STATE_OPERATING` handler (originally written for US) works for NG with just a different sub-market table.

### Volatile and Emerging States

Several Nigerian states are still finalizing their gaming frameworks. System admin maintains `operational_status` and `last_reviewed_at`; states flagged `volatile` default to excluded from distribution metadata until reviewed.

## IN Sub-Market Model (Blocklist at Distribution)

### Structure

```
Market: IN
├── Base layer: ASCI + Federal compliance applied to all IN assets
├── Allowlist (explicit legal states):
│   ├── Goa, Sikkim, Daman & Diu
├── Blocklist (explicit illegal states):
│   ├── Tamil Nadu, Andhra Pradesh, Telangana, Odisha, Assam, Nagaland, Karnataka (volatile)
└── Gray zone (default: allow, per brand config):
    └── All other states
```

### Why Different from US

- Business model: most brands operate **nationally in India** with state-level restrictions, not separate operations per state
- Regulation: **ASCI applies nationally**; state bans affect *distribution*, not asset creation
- Ad creative is usually a single IN version that gets **geo-fenced at distribution time**

### Data Model

```typescript
INStateConfig {
  market: "IN"
  
  allowlist_states: [
    { code: "GA", name: "Goa", notes: "casinos & limited online" },
    { code: "SK", name: "Sikkim", notes: "licensed online" },
    { code: "DD", name: "Daman & Diu", notes: "limited" }
  ]
  
  blocklist_states: [
    { code: "TN", name: "Tamil Nadu", law: "Tamil Nadu Prohibition of Online Gambling Act 2022" },
    { code: "AP", name: "Andhra Pradesh", law: "AP Gaming (Amendment) Act 2020" },
    { code: "TS", name: "Telangana", law: "Telangana Gaming (Amendment) Act 2017" },
    { code: "OR", name: "Odisha", law: "Odisha Prevention of Gambling Act" },
    { code: "AS", name: "Assam", law: "Assam Game and Betting Act" },
    { code: "NL", name: "Nagaland", law: "Nagaland Prohibition of Gambling Act" },
    { code: "KA", name: "Karnataka", law: "volatile - courts overturned 2021 ban", last_updated: date }
  ]
  
  gray_zone_states: [
    // All other states
  ]
  
  gray_zone_default_behavior: "allow" | "block"    // brand-configurable
}
```

### Processing Behavior

- **One LocalizedAsset per IN**: not per state
- ASCI rule pack applied to the IN asset (mandatory warnings, 20% area rule)
- **Distribution metadata** carries the state blocklist
- Platform integrations (Meta/Google/etc.) geo-fence by this blocklist

### Export Metadata for IN

```json
{
  "target_market": "IN",
  "distribution_restrictions": {
    "country_allowlist": ["IN"],
    "state_blocklist": ["TN", "AP", "TS", "OR", "AS", "NL", "KA"],
    "state_blocklist_reason_code": "local_law_prohibition",
    "state_blocklist_updated_at": "2026-04-15"
  },
  "mandatory_elements": {
    "asci_warning": "This game involves...",
    "asci_warning_area_percentage": 20,
    "age_label": "18+"
  }
}
```

### Brand-Level IN Configuration

Brand admins can customize:
- Gray zone default (allow or block)
- Additional states to blocklist beyond the legal minimum
- Notes per state for ad ops reference

### Karnataka Caveat

Karnataka's legal status has flipped multiple times (banned 2021, overturned 2021, then renewed discussion). The system must:
- Flag Karnataka as "volatile" in UI
- Show last-updated date of the legal status
- Default to **blocked** (safer) but allow brand to override
- Log any brand decision to allow Karnataka

## System Admin Maintenance

System admins (dev team) maintain:
- US sub-market list and `operational_status` (as states legalize or block)
- IN allowlist/blocklist (as state laws change)
- Each sub-market's base compliance rule pack
- Legal reference URLs and last_reviewed dates

Rule pack updates deploy via the standard rule update process (code deployment). Brand overrides apply on top as usual.

## UI Mockup: US Sub-Market Selection

```
┌────────────────────────────────────────────────────────┐
│ Target Markets for "Summer Promo" localization         │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ▼ United States                                        │
│   Your brand operates in: NJ, PA, NY, MI, IL, MA, OH, │
│                           CO, TN, VA, IN              │
│                                                        │
│   [Select brand operation states] [Select all active]  │
│                                                        │
│   ┌──────────────────────────────────────────────┐    │
│   │ Active states                                │    │
│   ├──────────────────────────────────────────────┤    │
│   │ ☑ New Jersey        ☑ Pennsylvania            │   │
│   │ ☑ New York          ☑ Michigan                │   │
│   │ ☑ Illinois          ☑ Massachusetts ⚠️        │   │
│   │ ☑ Ohio              ☑ Colorado                │   │
│   │ ☑ Tennessee ⚠      ☑ Virginia                 │   │
│   │ ☑ Indiana           ☑ Arizona                 │   │
│   │ ☐ Maryland          ☐ Connecticut             │   │
│   │ ... (more)                                    │   │
│   │                                               │   │
│   │ Blocked states (cannot distribute):           │   │
│   │ California, Texas, Utah, Hawaii, Alabama,    │   │
│   │ Georgia, Idaho, Minnesota, Oklahoma, SC      │   │
│   └──────────────────────────────────────────────┘    │
│                                                        │
│ ⚠️ = Submission review required before distribution   │
│                                                        │
│ ▼ United Kingdom            ☑                          │
│ ▼ Germany                   ☑                          │
│ ▼ France                    ☑                          │
│ ▼ Brazil                    ☑                          │
│ ▼ India                     ☑ [View state restrictions]│
│ ▼ Philippines               ☑                          │
└────────────────────────────────────────────────────────┘
```

## UI Mockup: IN State Restrictions

```
┌────────────────────────────────────────────────────────┐
│ India (IN) — State-Level Restrictions                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│ One asset version will be produced for India. State   │
│ restrictions are applied at distribution via geo-fence.│
│                                                        │
│ 🟢 Allowlist (explicit legal):                         │
│   Goa, Sikkim, Daman & Diu                            │
│                                                        │
│ 🔴 Blocklist (explicit illegal - always excluded):     │
│   Tamil Nadu, Andhra Pradesh, Telangana, Odisha,      │
│   Assam, Nagaland                                      │
│                                                        │
│ ⚠️ Karnataka — Volatile legal status (last updated    │
│    2026-02-15). Default: blocked. [Override] [Info]    │
│                                                        │
│ ⚪ Gray zone (all other states):                       │
│   Default: Allow distribution                          │
│   [Change default] [Configure per state]              │
│                                                        │
│ [Save IN state configuration]                          │
└────────────────────────────────────────────────────────┘
```

## MVP Scope

### V1 Required
- US sub-market data model and active/blocked state list (all 50 states + DC with status)
- **NG sub-market data model and per-state list (Lagos + FCT priority, others as stubs)**
- IN allowlist/blocklist state data model
- US per-state compliance rule packs for all 38 active states
- **NG per-state compliance rule packs for Lagos (LSLGA) and FCT (NLRC)**
- IN ASCI compliance rule pack (applied to all IN assets)
- US sub-market UI selection
- **NG sub-market UI selection (same component, different state list)**
- IN state restriction UI
- Per-sub-market `LocalizedAsset` generation (US, NG)
- Distribution metadata with state blocklist (IN)
- System admin interface to update state legal status

### V1 Top US States (Highest Priority for Rule Pack Content)
Tier 1: NJ, PA, NY, MI, IL, MA, OH, CO
Tier 2: TN, VA, IN, AZ, MD, CT, IA, LA, KS, KY
Tier 3+: remaining 20 states with baseline rule packs

### V1 NG Priority Sub-Markets
- NG-LA (Lagos) — LSLGA, most mature commercial regulator
- NG-FCT (Federal Capital Territory) — NLRC, federal post-2024
- Other NG states (Oyo, Rivers, etc.): data model present, rule packs minimal

### V1.5+
- Full 38-state US coverage
- Tribal market handling (Florida/Seminole, others)
- Brand-level custom IN state configuration
- US state legalization tracker (notify when new states go live)
- State-specific approval workflow requirements (MA submission review)

### V2+
- Automatic legal status monitoring (RSS/API from state regulators)
- Sub-market performance analytics
- Historical state rule version archive

## UK Sub-Market Model (Two Regions)

### Why UK Has Sub-Markets

The UK is **not a single regulatory regime** for gambling:

- **Great Britain (GB)**: England + Scotland + Wales, regulated by UK Gambling Commission (UKGC) under Gambling Act 2005
- **Northern Ireland (NI)**: Regulated separately under Betting, Gaming, Lotteries and Amusements (NI) Order — **not covered by GA 2005 or UKGC**

Most operators focus on GB; NI is a smaller market with older, more restrictive law. But if a brand distributes UK-wide, the distinction matters.

### Data Model

```
Market: UK
├── Default sub-market: UK-GB
│     — regulated by UKGC (Gambling Act 2005)
│     — covers England, Scotland, Wales
│     — default for V1 processing
└── Optional sub-market: UK-NI
      — regulated separately
      — brand must explicitly enable
      — distinct rule pack
```

### Product Behavior

- UK is selected as target → default = generate UK-GB asset
- If brand has declared NI operations → also generate UK-NI asset
- If NI not operated → distribution metadata explicitly excludes NI (prevent accidental distribution)
- Scotland and Wales are **NOT separate sub-markets**: they're within GB and use UKGC rules directly

### V1 Scope

- UK-GB full support (the main UK business)
- UK-NI: data model + minimal rule pack ("don't distribute here unless enabled")
- Brand-level toggle for NI operation

## BR Sub-Market Model (Data Placeholder for Future)

### Current State (2026)

Brazil uses a **centralized federal licensing model** via SPA (Secretaria de Prêmios e Apostas). A single federal license grants access to all 27 federative units (26 states + Federal District).

Currently, compliance is primarily federal:
- SPA licensing and rules
- Ordinance 1,231 (advertising restrictions)
- Federal mandatory warnings and RG requirements

### Why It Might Matter Later

State-level accreditation processes are emerging. Rio de Janeiro has passed legislation treating online bets as occurring within its territory, with specific requirements. São Paulo and other states are developing their own frameworks.

This is similar to where the US was around 2018-2019 — federal structure is settled, but state variations are emerging.

### V1 Strategy

- **Treat BR as single market for V1** (federal rules only)
- **Data model prepared** for sub-market expansion (structure identical to IN blocklist or US operating model)
- **System admin quarterly review**: monitor Brazilian state legislation and update when material rules emerge
- **No UI sub-market selector** in V1 (hidden until data exists)

### Data Model (Prepared But Empty)

```typescript
BRStateConfig {
  market: "BR"
  
  // V1: empty — federal rules apply uniformly
  // V2+: populated as states pass material legislation
  
  state_rule_packs: []              // e.g., future "BR-RJ", "BR-SP"
  state_advertising_restrictions: {}
  state_distribution_restrictions: {}
  
  federal_rules_only: true          // V1 flag
  last_reviewed_at: date
}
```

### When to Promote BR to Full Sub-Market Treatment

Trigger conditions (system admin review):
- A state passes specific ad content requirements different from federal
- A state mandates specific RG messaging or hotlines
- A state restricts advertising in ways the federal level doesn't
- Two or more states have meaningful differences

When this happens, BR follows the IN blocklist model or expands into per-state rule packs like US.


