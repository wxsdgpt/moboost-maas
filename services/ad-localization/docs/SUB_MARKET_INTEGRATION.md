# Sub-Market Integration: How Sub-Markets Flow Through the Localization Pipeline

## Purpose

This document explains **how sub-market rules integrate with every step** of the localization pipeline. Read this alongside `SUB_MARKETS.md` (which defines the data) and `ARCHITECTURE.md` (which defines the pipeline).

**Key principle**: Sub-market is a first-class abstraction. All downstream components accept `LocalizationTarget` (market + optional sub-market) as input, not raw market strings. 5 sub-market models are parameterized, not hard-coded per country.

## The Central Abstraction: LocalizationTarget

```typescript
LocalizationTarget {
  market: string                       // "US", "IN", "UK", "DE", etc.
  sub_market?: string                  // "US-NJ", "UK-GB", "UK-NI", or null
  
  // Distribution metadata accompanies the target
  distribution_blocklist?: string[]    // e.g., IN state blocklist
  distribution_allowlist?: string[]    // e.g., UK-GB restricts to GB
  
  // Special flags
  requires_submission_review?: boolean // e.g., US-MA
  time_window_restriction?: [string, string]  // e.g., DE 21:00-06:00
}
```

Every pipeline component accepts a `LocalizationTarget`, not just a market name. This is the contract that prevents ad-hoc `if market == "US"` code scattered across the codebase.

## 5 Sub-Market Models (Parameterized)

```python
class SubMarketModel(Enum):
    PER_STATE_OPERATING = "per_state_operating"      # US
    BLOCKLIST_AT_DISTRIBUTION = "blocklist"          # IN
    OPTIONAL_DUAL_REGION = "optional_dual"            # UK
    FEDERAL_ONLY = "federal_only"                    # DE, FR, PH
    FEDERAL_WITH_PLACEHOLDER = "federal_placeholder" # BR (V1 federal, ready for expansion)
```

Each market's config declares its model:

```python
market_configs = {
    "US": SubMarketModel.PER_STATE_OPERATING,
    "NG": SubMarketModel.PER_STATE_OPERATING,   # post-2024 Supreme Court ruling
    "IN": SubMarketModel.BLOCKLIST_AT_DISTRIBUTION,
    "UK": SubMarketModel.OPTIONAL_DUAL_REGION,
    "BR": SubMarketModel.FEDERAL_WITH_PLACEHOLDER,
    "DE": SubMarketModel.FEDERAL_ONLY,
    "FR": SubMarketModel.FEDERAL_ONLY,
    "PH": SubMarketModel.FEDERAL_ONLY,
}
```

## Pipeline Integration Points

### Point 1: Market Selection UI

The UI component that renders target market selection reads the model:

```python
def render_market_selector(market: str, brand: Brand):
    model = market_configs[market]
    
    if model == PER_STATE_OPERATING:
        # Render expandable state list with active/blocked status
        render_us_state_selector(brand)
    elif model == BLOCKLIST_AT_DISTRIBUTION:
        # Render blocklist viewer (read-only or brand-configurable)
        render_in_blocklist_view(brand)
    elif model == OPTIONAL_DUAL_REGION:
        # Render GB default + NI optional checkbox
        render_uk_region_selector(brand)
    elif model in (FEDERAL_ONLY, FEDERAL_WITH_PLACEHOLDER):
        # Simple checkbox, no sub-market UI
        render_simple_market_toggle(market)
```

**No hard-coded US/IN/UK branches in the UI layer itself** — it dispatches based on the model.

### Point 2: SubMarketResolver (Target Expansion)

After user submits selections, this service expands them into concrete targets:

```python
class SubMarketResolver:
    def resolve_targets(
        self,
        selected_markets: list[str],
        user_sub_market_selections: dict,
        brand: Brand
    ) -> list[LocalizationTarget]:
        
        targets = []
        for market in selected_markets:
            model = market_configs[market]
            handler = self._get_handler(model)
            targets.extend(handler.expand(market, user_sub_market_selections, brand))
        
        return targets
    
    def _get_handler(self, model: SubMarketModel):
        return {
            PER_STATE_OPERATING: PerStateHandler(),
            BLOCKLIST_AT_DISTRIBUTION: BlocklistHandler(),
            OPTIONAL_DUAL_REGION: OptionalDualHandler(),
            FEDERAL_ONLY: FederalHandler(),
            FEDERAL_WITH_PLACEHOLDER: FederalHandler(),  # same for V1
        }[model]
```

Each handler implements a simple `expand()` contract. Adding a new model later = adding a new handler class.

### Point 3: Strategy Default Resolver

When computing default strategies per LU × target, the resolver consults sub-market rules:

```python
def resolve_default_strategy(lu: LU, target: LocalizationTarget, brand: Brand):
    # Start with market-level defaults
    rules = compile_effective_rules(target, brand)
    
    # Check LU against rules
    for rule in rules:
        if rule.forbids_content_of(lu):
            return Strategy.USER_PROVIDED  # force user decision
        if rule.requires_transcreation_for(lu):
            return Strategy.TRANSCREATE
    
    # Fall through to generic defaults
    return generic_default_for(lu.semantic_role, target.market)
```

Sub-market rules can override market defaults. Example: US-TN's "free bet" ban forces a specific strategy for any LU containing that phrase.

### Point 4: Prompt Assembly (Sub-Market Layer)

Every AI call that targets a specific sub-market applies the `SubMarketComplianceLayer`:

```python
class SubMarketComplianceLayer(PromptLayer):
    name = "sub_market_compliance"
    priority = 57  # between Market (55) and federal Compliance (100)
    
    def apply(self, context):
        if not context.target.sub_market:
            return NoContribution()
        
        sub_market_rules = load_sub_market_rules(context.target.sub_market)
        
        return LayerContribution(
            negative_additions=[rule.forbidden_term for rule in sub_market_rules],
            positive_additions=[rule.required_element for rule in sub_market_rules],
            metadata={"applied_rules": [r.id for r in sub_market_rules]}
        )
```

Sub-market layer priority is **higher than market-level culture/language** but **lower than federal compliance** (which always wins last). This lets state rules refine market rules but not override federal.

### Point 5: Rule Compilation

Most critical integration point. Every compliance check compiles a unified rule set:

```python
def compile_effective_rules(target: LocalizationTarget, brand: Brand) -> list[Rule]:
    """
    Compile effective rules in correct precedence order:
    Federal < State/Province < Brand Override
    """
    rules = []
    
    # 1. Federal/market rules (always apply)
    rules.extend(load_market_rules(target.market))
    
    # 2. Sub-market rules (if applicable)
    if target.sub_market:
        rules.extend(load_sub_market_rules(target.sub_market))
    elif target.distribution_blocklist:
        # IN model: federal rules apply; blocklist is distribution-side, not content-side
        pass
    
    # 3. Brand overrides layered on top
    rules = apply_brand_overrides(rules, brand, target)
    
    return rules
```

Output is a flat list of effective rules used by **all downstream consumers** (compliance engine, overlay renderer, UI warnings).

### Point 6: Compliance Engine

The engine checks the compiled rule set against the localized output:

```python
def check_compliance(localized_asset: LocalizedAsset, target: LocalizationTarget, brand: Brand):
    effective_rules = compile_effective_rules(target, brand)
    
    findings = []
    for rule in effective_rules:
        if violation := rule.check_against(localized_asset):
            findings.append(violation)
    
    return ComplianceReport(
        target=target,
        rule_snapshot_hash=hash(effective_rules),  # for audit
        findings=findings
    )
```

Notice: the engine doesn't know about US/IN/UK specifically. It just evaluates the compiled rule set. This is the payoff of centralizing in `compile_effective_rules`.

### Point 7: Compliance Overlay Renderer

Reads the target's mandatory elements (which include sub-market-specific variants):

```python
def render_compliance_overlay(asset: Asset, target: LocalizationTarget):
    elements = load_mandatory_elements(target)
    # For US-NJ: NJ license, 21+, 1-800-GAMBLER
    # For US-NY: NY license, 21+, 1-877-8-HOPE-NY
    # For US-TN: TN license, 21+, TN-specific hotline
    # For UK-GB: UKGC license, 18+, BeGambleAware
    # For UK-NI: NI order reference, 18+, NI-appropriate hotline
    # For IN:    SPA license, 18+, full ASCI warning (20% area)
    # For DE:    GGL license, 18+, "Spielen kann süchtig machen..."
    
    for element in elements:
        asset = deterministic_render(asset, element)  # Pillow/FFmpeg
    
    return asset
```

### Point 8: LocalizedAsset Record Creation

The data model already uses `target_market + target_sub_market`. One source asset produces multiple `LocalizedAsset` records when `PER_STATE_OPERATING` or `OPTIONAL_DUAL_REGION` models apply.

```python
def create_localized_assets(source_asset, targets):
    return [
        LocalizedAsset(
            source_asset_id=source_asset.id,
            target_market=t.market,
            target_sub_market=t.sub_market,
            platform_metadata={
                "allowed_sub_regions": t.distribution_allowlist,
                "blocked_sub_regions": t.distribution_blocklist,
                "time_window": t.time_window_restriction,
                "requires_submission_review": t.requires_submission_review,
            },
            ...
        )
        for t in targets
    ]
```

### Point 9: Confirmation UI

Ad ops sees outputs grouped by market, with sub-markets as sub-rows:

```
▼ United States (5 outputs)
  🟢 NJ        All passed
  🟡 PA        1 warning
  🟡 NY        2 warnings
  🔴 MA        Submission review required
  🟡 TN        1 critical (forbidden term)

▼ United Kingdom (1 output)
  🟡 GB        1 warning

▼ India (1 output — with 7 state blocks)
  🟢 IN        Distribution: ex-TN,AP,TS,OR,AS,NL,KA
```

Grouping logic uses `target_market` and `target_sub_market` fields directly. No hard-coded country grouping logic.

### Point 10: Export Metadata

The export adapter reads the target's distribution metadata:

```python
def export_for_platform(localized_asset, platform):
    base_export = {
        "asset_file": localized_asset.output_file_url,
        "target_country": localized_asset.target_market,
    }
    
    if localized_asset.target_sub_market:
        # US-NJ → region targeting
        base_export["target_sub_region"] = parse_sub_region(localized_asset.target_sub_market)
    
    if localized_asset.platform_metadata.get("blocked_sub_regions"):
        # IN → state geo-fence
        base_export["blocked_regions"] = localized_asset.platform_metadata["blocked_sub_regions"]
    
    if localized_asset.platform_metadata.get("time_window"):
        # DE → time window
        base_export["scheduling"] = localized_asset.platform_metadata["time_window"]
    
    return platform_adapter(base_export, platform)
```

## End-to-End Example: "Football Promo" Asset to US + UK + NG + IN + DE

To make this concrete, here's a real trace:

### Input
- Source: PSD with football player image, "Risk-Free Bet $10 Get $100" CTA
- Markets selected: US (NJ, PA, NY, MA, TN), UK (GB only), NG (LA, FCT), IN, DE
- Brand: sample, active in 10 US states + Lagos + FCT

### SubMarketResolver output
```
Targets (10 total):
  T1:  LocalizationTarget(US, US-NJ)
  T2:  LocalizationTarget(US, US-PA)
  T3:  LocalizationTarget(US, US-NY)
  T4:  LocalizationTarget(US, US-MA, requires_submission_review=True)
  T5:  LocalizationTarget(US, US-TN)
  T6:  LocalizationTarget(UK, UK-GB)
  T7:  LocalizationTarget(NG, NG-LA)
  T8:  LocalizationTarget(NG, NG-FCT)
  T9:  LocalizationTarget(IN, null, distribution_blocklist=[TN,AP,TS,OR,AS,NL,KA])
  T10: LocalizationTarget(DE, null, time_window_restriction=[21:00, 06:00])
```

### Strategy Matrix Generation
For "Risk-Free" text LU across targets:
```
T1 (US-NJ):  light_localize + warning "risk-free restricted"
T2 (US-PA):  light_localize + warning
T3 (US-NY):  transcreate + critical "NY prohibits in guidance"
T4 (US-MA):  transcreate + MGC submission flag
T5 (US-TN):  transcreate (TN rule pack forbids "free bet" family entirely)
T6 (UK-GB):  transcreate + warning "UKGC restricts risk-free"
T7 (NG-LA):  transcreate + warning "LSLGA forbids guaranteed-win language"
T8 (NG-FCT): transcreate + same warning (NLRC National Lottery Act)
T9 (IN):     light_localize (no specific rule)
T10 (DE):    transcreate + warning "misleading claim risk"
```

### Prompt Assembly Example for T7 (NG-LA)
```
Layers applied:
1. BaseLayer (text_transcreate)
2. BrandVoiceLayer
3. BrandGlossaryLayer
4. MarketLanguageLayer (en, with NG context — football-first)
5. MarketCultureLayer (NG — Premier League/AFCON references OK)
6. SubMarketComplianceLayer (NG-LA)
   → forbidden: ["guaranteed win", "no risk", "easy money", "risk-free", "sure thing"]
   → hotline: LSLGA-specified
   → 18+ mandatory visible
7. MarketComplianceLayer (NG federal residual)
8. SourceContextLayer

Compiled prompt (excerpt):
"...create a transcreation of 'Risk-Free Bet $10 Get $100' for Lagos, Nigeria.
 CONSTRAINTS: Must not use 'risk-free', 'guaranteed win', 'no risk', 'easy money'.
 LSLGA responsible gambling hotline must be available.
 Currency: NGN.
 Generate 3 candidates."
```

### Compliance Overlay for Each Target
```
T1 (US-NJ):  adds 21+, "Call 1-800-GAMBLER", NJ DGE license
T3 (US-NY):  adds 21+, "Call 1-877-8-HOPE-NY", NY GCB license, additional NY disclosures
T5 (US-TN):  adds 21+, TN-specific hotline, TN disclosures
T6 (UK-GB):  adds 18+, BeGambleAware logo + URL, UKGC license
T7 (NG-LA):  adds 18+, LSLGA license number, "Play responsibly", LSLGA hotline
T8 (NG-FCT): adds 18+, NLRC license number, "Play responsibly", federal hotline
T9 (IN):     adds 18+, full ASCI warning (20% area), SPA license
T10 (DE):    adds 18+, "Spielen kann süchtig machen...", GGL license
```

### Export Metadata
```
T1:  {country: "US", sub_region_allowlist: ["NJ"]}
T3:  {country: "US", sub_region_allowlist: ["NY"]}
T7:  {country: "NG", sub_region_allowlist: ["LA"]}
T8:  {country: "NG", sub_region_allowlist: ["FCT"]}
T9:  {country: "IN", blocked_regions: ["TN","AP","TS","OR","AS","NL","KA"]}
T10: {country: "DE", scheduling: {start: "21:00", end: "06:00"}}
```

## Testing Strategy

The parameterized sub-market model enables clean tests:

### Unit Tests
- Each sub-market model handler tested independently
- `SubMarketResolver.resolve_targets()` tested with mock inputs per model

### Integration Tests
- Full pipeline for each sub-market model variant:
  - US: PSD → ~38-state targets (per brand config) → N LocalizedAsset with distinct overlays
  - NG: PSD → Lagos + FCT targets → 2 LocalizedAsset with distinct LSLGA / NLRC overlays
  - IN: PSD → 1 target with blocklist → 1 LocalizedAsset with distribution metadata
  - UK: PSD → 1-2 targets depending on brand NI enablement
  - DE/FR/PH: PSD → 1 federal target

### Golden File Tests
- For each sub-market, snapshot expected effective rule set
- Changes to rule compilation must be intentional and approved

## V1 Implementation Order

1. **Phase 2**: `LocalizationTarget` abstraction, `SubMarketResolver` with handlers for all 5 models (even if IN/BR handlers are thin)
2. **Phase 3**: `SubMarketComplianceLayer` in Prompt Assembly; US Tier 1 state rule packs (NJ/PA/NY/MI/IL/MA/OH/CO) + NG-LA (Lagos) + NG-FCT rule packs
3. **Phase 4**: Full rule compilation with brand overrides; compliance overlay per sub-market; submission-review flag handling for MA
4. **Phase 5**: Export metadata adapters honoring distribution allow/block/time-window

## Anti-Patterns to Avoid

**Don't** scatter `if market == "US": ... elif market == "NG": ... elif market == "IN": ...` branches across the codebase. Centralize in the resolver and handler classes. The US and NG handlers share the same `PerStateHandler` class, parameterized by their respective sub-market tables.

**Don't** create separate tables or models per country. One `SubMarket` table, one `ComplianceRulePack` table, all parameterized.

**Don't** treat sub-markets as an afterthought added to market-level logic. Design `LocalizationTarget` as the atomic unit from day one.

**Don't** let UI components read `market` strings directly to decide rendering. UI should query `market_config` and dispatch on `SubMarketModel`.
