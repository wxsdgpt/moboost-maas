# Compliance Governance & Review Workflow

## Overview

This document defines how compliance rules are managed, how compliance checks are enforced, and how the review workflow operates.

**Core philosophy**: The system advises, the user decides. No legal team in the loop — the marketing/ad ops team owns the final decision, and the system ensures everything is traceable.

## Rule Management Model

### Two-Layer Rule System

Rules exist in two layers:

**Layer 1: System Default Rules**
- Maintained by the development team (us)
- Ship with the product
- Updated via deployment when regulations change
- Versioned and snapshot for audit
- **No user can edit these directly**

**Layer 2: Brand Override Rules**
- Maintained by each brand's Brand Admin
- Scoped to that brand only
- Can both tighten and relax system defaults (with safeguards)
- Versioned per brand

### How Layers Combine

For any given compliance check, the effective rule set is:

```
effective_rules = system_default_rules + brand_overrides
```

Where brand_overrides can:
- **Add** new rules (always additive)
- **Tighten** existing rules (e.g., lower threshold for a warning)
- **Relax** existing rules (e.g., disable a system default for this brand)
- **Disable** existing rules entirely

### Safeguards for Relaxing Rules

Since brand admins have power to relax rules, the system must protect against abuse and mistakes:

**Mandatory logging**: Every relaxation is logged with:
- Who made the change
- When
- What rule was changed
- Previous state vs new state
- Optional: reason note (strongly encouraged by UI)

**Change notifications**: When a brand admin relaxes a rule, the system:
- Notifies all users within the brand with compliance-related roles
- Sends a digest email to system administrators (cross-brand observability)
- Flags the rule with a visual indicator in the UI ("Relaxed by brand admin")

**System Administrator Observability**: System admins (usually the dev team or company IT/compliance function) have read-only visibility into ALL brands' override configurations. This prevents a single brand from silently eroding their compliance posture.

**No deletion of audit records**: Once a rule change is logged, it cannot be deleted — only superseded by further changes.

## Warning Severity Model

All compliance findings are **warnings**, not blockers. The system never prevents submission. Severity controls the UI treatment and whether a reason is required.

### Severity Levels

| Level | UI Treatment | Reason Required? |
|---|---|---|
| **Critical** | Red banner, expandable detail, prominent icon | Configurable (default: yes, see below) |
| **Warning** | Amber indicator, summary with "View details" | No by default |
| **Info** | Gray hint, collapsible | No |

### Reason-Required Configuration

Brand admins configure which rule categories require a written reason before the user can proceed past them.

**Recommended defaults (ship with system)**:
- DE: specific odds display
- DE, FR: live broadcast-style content
- UK, US: real active athletes / celebrity lookalikes
- All markets: minors / minor-looking persons
- All markets: investment/guaranteed-win claims
- Unauthorized market deployment (asset targeted to market where brand has no license)

Brand admins can:
- Toggle these defaults on/off per rule
- Add additional rules to the "reason-required" list
- Set minimum reason length (default: 30 characters)
- Set "approval required" — a few ultra-critical rules can require a second user to approve (optional feature)

### Reason Entry UX

When a user clicks "Acknowledge and Proceed" on a reason-required warning:
1. A modal opens with the rule details and regulation reference
2. User types a reason (enforced minimum length)
3. User clicks "Confirm and Proceed"
4. System records: user ID, timestamp, reason text, rule ID, rule version, asset ID
5. This record is immutable

## Brand Override Capabilities

### What Brand Admins Can Override

For any system default rule within their brand scope:

```typescript
BrandRuleOverride {
  id: UUID
  brand_id: UUID
  system_rule_id: UUID              // the rule being overridden (null for additive)
  
  override_type: "add" | "tighten" | "relax" | "disable"
  
  // For override_type = "tighten" or "relax"
  modifications: {
    severity?: "critical" | "warning" | "info"   // change severity level
    trigger_conditions?: object                  // modify detection criteria
    message_override?: string                    // custom messaging
    reason_required_override?: boolean           // change reason requirement
  }
  
  // For override_type = "add"
  new_rule_definition?: ComplianceRule          // entirely new rule
  
  // Metadata
  created_by: UUID                              // brand admin
  created_at: timestamp
  change_reason: string                         // strongly encouraged
  effective_from: date
  effective_to?: date
  
  version: int
  is_active: boolean
}
```

### Rule Compilation

When evaluating an asset, the system compiles the effective rule set:

```python
def compile_effective_rules(brand_id: UUID, market: str) -> list[Rule]:
    system_rules = load_system_default_rules(market)
    brand_overrides = load_brand_overrides(brand_id, market)
    
    effective = []
    
    for rule in system_rules:
        override = find_override_for(rule, brand_overrides)
        
        if override is None:
            effective.append(rule)
        elif override.override_type == "disable":
            # Rule is disabled; log this was checked but skipped
            log_skipped_rule(rule, override, reason="disabled_by_brand_override")
        elif override.override_type in ("tighten", "relax"):
            merged = apply_override(rule, override)
            effective.append(merged)
    
    # Add brand-specific additive rules
    for override in brand_overrides:
        if override.override_type == "add":
            effective.append(override.new_rule_definition)
    
    return effective
```

### System Admin View

System admins have a cross-brand dashboard showing:
- Which brands have the most overrides
- Which system rules are most frequently relaxed (red flag: if 80% of brands disable a rule, maybe the rule is wrong)
- Recent override activity timeline
- Brands with relaxations that differ significantly from the baseline

This doesn't block brand autonomy, but gives visibility for the dev team to improve default rules and identify risky brand configurations.

## Review Workflow (Simplified — No Legal Stage)

With marketing/ad ops as the sole validator, the workflow has two stages:

```
┌─────────────────────────────────────┐
│ Stage 1: Automated Compliance Check │
│   - Rule engine evaluation          │
│   - Visual AI checks                │
│   - Change minimization verification│
│   → Generates compliance report     │
│   → Always completes in seconds     │
└───────────────┬─────────────────────┘
                ↓
┌─────────────────────────────────────┐
│ Stage 2: Ad Ops Confirmation        │
│   - Review compliance report        │
│   - Acknowledge each critical       │
│     warning (with reason if req.)   │
│   - Acknowledge each warning        │
│   - Click "Confirm for Distribution"│
│   → Confirmation is mandatory       │
│   → Even with zero findings         │
└─────────────────────────────────────┘
```

**Key change from original design**: No legal review stage. No "rejection" path at stage 2 (ad ops owns the decision; they can choose not to proceed but that's a save/discard, not a formal rejection).

### Confirmation Flow Even When Clean

If the compliance check returns zero findings, the user still sees:

```
┌──────────────────────────────────────┐
│ ✓ All compliance checks passed       │
│                                      │
│ No violations detected for this      │
│ asset across target markets.         │
│                                      │
│ Please review the final output and   │
│ confirm this asset is ready for      │
│ distribution.                        │
│                                      │
│ [View Final Outputs] [Confirm]       │
└──────────────────────────────────────┘
```

The user must click "Confirm". This ensures they actually reviewed the asset, not just the checks. The confirmation is logged.

### Confirmation Flow with Findings

```
┌──────────────────────────────────────────────┐
│ Compliance Report for [asset name]           │
│                                              │
│ [DE] 1 Critical, 2 Warnings                  │
│ [UK] 1 Warning                               │
│ [BR] All passed                              │
│ ... (8 markets total)                        │
│                                              │
│ ⚠ Critical: Specific odds displayed (DE)     │
│    Rule: GlüStV §5 Abs. 3                    │
│    Detected: "Odds 2.5" in image bottom-right│
│    Suggestion: Remove specific odds value    │
│    ╔════════════════════════════════╗        │
│    ║ Reason for proceeding required ║        │
│    ║ [Text area]                    ║        │
│    ╚════════════════════════════════╝        │
│    [Acknowledge and Proceed]                 │
│                                              │
│ ⚠ Warning: Small legal text (UK)             │
│    [Acknowledge]                             │
│                                              │
│ [Confirm All and Distribute] [Go Back]       │
└──────────────────────────────────────────────┘
```

Each warning must be individually acknowledged. Reason fields (where required) must be filled. Only then does the "Confirm All and Distribute" button enable.

## Roles & Permissions

### Marketing Specialist / Ad Ops
- Upload source assets
- Set localization strategies per LU
- Run compliance checks
- Acknowledge warnings and confirm assets for distribution
- View their own audit history

### Brand Admin
- All Marketing Specialist permissions
- Manage brand settings (restrictions, glossary, voice)
- Manage brand rule overrides (add, tighten, relax, disable)
- Configure which rule types require reason
- Add/remove users from brand
- View brand-wide audit history

### System Administrator
- Cross-brand read-only visibility
- Manage users and brands
- View system-wide audit history
- Deploy rule updates (via dev process, not in-app)
- Access cost and usage reports
- Does NOT edit rules in-app (rules go through dev deployment)

### Removed Roles
- ~~Legal / Compliance Officer~~ — merged responsibility into Brand Admin + Ad Ops
- ~~Market Manager (as separate stage)~~ — their input happens during strategy selection, not a separate review stage

## Audit Requirements

Every confirmation action creates an immutable audit record:

```typescript
AssetConfirmation {
  id: UUID
  asset_id: UUID
  confirmed_by: UUID
  confirmed_at: timestamp
  
  compliance_report_snapshot: ComplianceReport    // full snapshot at time of confirmation
  effective_rules_snapshot: string                // hash of the rule set used
  
  acknowledgments: [
    {
      finding_id: UUID
      rule_id: UUID
      rule_version: int
      severity: string
      acknowledged_at: timestamp
      reason_provided?: string
      reason_length?: int
    }
  ]
  
  brand_override_state: {                         // which overrides were active
    active_override_ids: UUID[]
    disabled_system_rules: UUID[]
  }
  
  ip_address: string
  user_agent: string
  
  // Never updatable
}
```

This record is the "this person, at this time, saw these specific findings and chose to proceed" legal evidence.

## Regulatory Audit Scenarios

When a regulator investigates (months later), the flow is:

1. Regulator provides asset ID and date
2. System retrieves:
   - Source asset + hash
   - Localized outputs + hashes
   - AIGenerationLog entries (full prompt traces)
   - Compliance report at time of confirmation
   - AssetConfirmation record (who approved, what they saw, what reasons given)
   - Effective rule set snapshot (system defaults + brand overrides at that moment)
3. System exports a regulatory audit package (PDF) with all above

This is the legal protection. Every decision is documented, every rule state is recoverable.

## Failure Modes to Handle

### User Clicks "Confirm" Without Reading
- Mitigation 1: Critical warnings are collapsed by default and must be expanded (hover/click) to acknowledge
- Mitigation 2: Reason text has minimum length and anti-spam check (no "." or "x")
- Mitigation 3: Confirmations logged; if user confirms 100 assets in 5 minutes, flag for system admin review

### Brand Admin Disables Too Many Rules
- System admin dashboard alerts when a brand has disabled > N system rules
- Weekly digest to system admin listing brands with significant relaxations
- Cannot prevent, but ensures visibility

### Rule Engine Missed a Violation
- Compliance check is advisory; user still signs off on final asset
- Post-launch monitoring: if regulator flags an asset, system can identify which rule would have caught it and evaluate if rule should be added

### Override Conflicts
- If two overrides conflict (shouldn't happen but...), tightening wins
- Brand admins can't create conflicting overrides (UI prevents)

## V1 Scope

### Required
- System default rule library (8 markets)
- Brand override CRUD (add, tighten, relax, disable)
- Rule compilation and evaluation
- Severity-based UI treatment (Critical/Warning/Info)
- Reason requirement configuration
- Two-stage workflow with confirmation
- AssetConfirmation audit records
- System admin observability dashboard
- Immutable audit logging

### Deferred
- Second-user-approval flow for ultra-critical rules
- Rule suggestion engine ("brands like yours often add these rules")
- Auto-flag unusual override patterns
- Weekly digest emails
- Rule effectiveness analytics
