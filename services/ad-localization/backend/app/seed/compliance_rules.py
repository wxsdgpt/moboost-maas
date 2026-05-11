"""System default compliance rules for the 8 V1 markets.

Rules are data-only here; the evaluator interprets them. Sourced from
COMPLIANCE_RULES.md. Per CLAUDE.md all findings are advisory (never blocking);
severity just drives UI treatment and the reason-required flow.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.enums import RuleCategory, Severity


@dataclass
class RuleSeed:
    market: str
    code: str
    category: RuleCategory
    severity: Severity
    title: str
    message: str
    suggested_fix: str | None
    trigger: dict
    regulation_reference: str | None
    reason_required_by_default: bool = False


# ---------------- shared cross-market rules ------------------------------

CROSS_MARKET = [
    RuleSeed(
        market="*",
        code="cross.minor_appearance",
        category=RuleCategory.visual_restriction,
        severity=Severity.critical,
        title="Minor or minor-looking person",
        message="Ads must not feature minors or people who appear under the legal gambling age.",
        suggested_fix="Replace with a person clearly above the market's minimum age.",
        trigger={"type": "image_detection", "conditions": {"check": "underage_person"}},
        regulation_reference="cross-market baseline",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="*",
        code="cross.cartoon_imagery",
        category=RuleCategory.visual_restriction,
        severity=Severity.warning,
        title="Cartoon imagery detected",
        message="Cartoons can attract minors and are widely restricted.",
        suggested_fix="Use realistic imagery.",
        trigger={"type": "image_detection", "conditions": {"check": "cartoon"}},
        regulation_reference="cross-market baseline",
    ),
    RuleSeed(
        market="*",
        code="cross.financial_solution_claim",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="Implies gambling solves financial problems",
        message="Claims that gambling is a way to pay debts / make money violate most market codes.",
        suggested_fix="Remove financial-solution framing.",
        trigger={
            "type": "text_match",
            "conditions": {
                "phrases": [
                    "make money",
                    "pay off debt",
                    "get rich",
                    "become rich",
                    "quick cash",
                    "second income",
                ]
            },
        },
        regulation_reference="cross-market baseline",
        reason_required_by_default=True,
    ),
]


# ---------------- UK ------------------------------------------------------

UK = [
    RuleSeed(
        market="UK-GB",
        code="uk.risk_free",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Risk-free' prohibited (UKGC/CAP)",
        message="CAP Code prohibits 'risk-free' claims unless the offer is genuinely risk-free.",
        suggested_fix="Use 'qualifying bet' or equivalent neutral language.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["risk-free", "risk free"]},
        },
        regulation_reference="CAP Code 16.3.12",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="UK-GB",
        code="uk.strong_urgency",
        category=RuleCategory.forbidden_word,
        severity=Severity.warning,
        title="Strong urgency language",
        message="Language that creates strong time pressure is restricted by CAP.",
        suggested_fix="Soften urgency or remove countdown framing.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["last chance", "hurry", "act now", "limited time"]},
        },
        regulation_reference="CAP Code 16.3.14",
    ),
    RuleSeed(
        market="UK-GB",
        code="uk.begambleaware",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="BeGambleAware logo / link required",
        message="UK ads must carry BeGambleAware logo or begambleaware.org link.",
        suggested_fix="Ensure BeGambleAware is present in footer / overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.begambleaware"}},
        regulation_reference="UKGC LCCP",
    ),
    RuleSeed(
        market="UK-GB",
        code="uk.age_label_18",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="18+ label required",
        message="UK ads must clearly display '18+'.",
        suggested_fix="Render '18+' using the deterministic overlay layer.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.age_label"}},
        regulation_reference="CAP Code",
    ),
]


# ---------------- DE ------------------------------------------------------

DE = [
    RuleSeed(
        market="DE",
        code="de.odds_numeric",
        category=RuleCategory.visual_restriction,
        severity=Severity.critical,
        title="Specific odds display prohibited",
        message="GlüStV §5 prohibits displaying specific odds values (e.g. 2.5, +150).",
        suggested_fix="Remove the odds display or replace with a neutral phrase.",
        trigger={
            "type": "regex",
            "conditions": {
                "pattern": r"(?<![\w])(?:\+|\-)?\d{1,3}(?:[.,]\d{1,2})?(?![\w])",
                "applies_to_roles": ["odds"],
            },
        },
        regulation_reference="GlüStV §5 Abs. 3",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="DE",
        code="de.forbidden_words",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Risikofrei' / 'garantierter Gewinn' prohibited",
        message="GGL guidance prohibits risk-free / guaranteed-win claims.",
        suggested_fix="Replace with neutral factual copy.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["risikofrei", "garantierter gewinn", "risk-free"]},
        },
        regulation_reference="GlüStV §5",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="DE",
        code="de.time_window",
        category=RuleCategory.scheduling,
        severity=Severity.critical,
        title="Ad must be flagged for 21:00-06:00 broadcast window",
        message="DE sports-betting ads can only be distributed 21:00-06:00 CE(S)T.",
        suggested_fix="Platform metadata.allowed_time_windows must be [21, 6].",
        trigger={
            "type": "metadata_check",
            "conditions": {"op": "required", "field": "distribution.time_window_deferred"},
        },
        regulation_reference="GlüStV §5",
    ),
    RuleSeed(
        market="DE",
        code="de.mandatory_warning",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="German mandatory warning missing",
        message="DE assets must carry the exact regulator warning text.",
        suggested_fix="Inject 'Spielen kann süchtig machen...' via the deterministic overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.de_warning"}},
        regulation_reference="GlüStV §5",
    ),
    RuleSeed(
        market="DE",
        code="de.excitement_tone",
        category=RuleCategory.audio_restriction,
        severity=Severity.warning,
        title="Excessive excitement in audio",
        message="DE forbids excited / hype audio tone.",
        suggested_fix="Use a calm, observational narration.",
        trigger={
            "type": "audio_detection",
            "conditions": {"check": "excitement_level", "max": 0.3},
        },
        regulation_reference="GlüStV §5 / GGL guidance",
    ),
]


# ---------------- FR ------------------------------------------------------

FR = [
    RuleSeed(
        market="FR",
        code="fr.mandatory_warning",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="French health warning missing",
        message="ANJ requires the exact 'Jouer comporte des risques...' warning.",
        suggested_fix="Inject the full warning via the deterministic overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.fr_warning"}},
        regulation_reference="Code de la sécurité intérieure art. L.320-*",
    ),
    RuleSeed(
        market="FR",
        code="fr.no_alcohol_co_occurrence",
        category=RuleCategory.visual_restriction,
        severity=Severity.warning,
        title="Alcohol co-occurrence forbidden",
        message="FR ads cannot mix gambling with alcohol imagery.",
        suggested_fix="Remove or replace alcohol element.",
        trigger={"type": "image_detection", "conditions": {"check": "alcohol"}},
        regulation_reference="ANJ",
    ),
]


# ---------------- US (federal) + US-TN special ------------------------

US_FEDERAL = [
    RuleSeed(
        market="US",
        code="us.risk_free",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Risk-free' prohibited (FTC)",
        message="FTC has explicitly prohibited 'risk-free' claims in US sports betting ads.",
        suggested_fix="Remove 'risk-free' from copy.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["risk-free", "risk free", "no risk"]},
        },
        regulation_reference="FTC guidance 2023",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="US",
        code="us.guaranteed",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Guaranteed win' prohibited",
        message="FTC prohibits guaranteed-outcome language.",
        suggested_fix="Remove or rephrase.",
        trigger={
            "type": "text_match",
            "conditions": {
                "phrases": ["guaranteed", "sure thing", "can't lose", "cannot lose"]
            },
        },
        regulation_reference="FTC guidance 2023",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="US",
        code="us.rg_hotline",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="1-800-GAMBLER required",
        message="State regulators require the RG hotline on ads.",
        suggested_fix="Inject 1-800-GAMBLER via the overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.rg_hotline"}},
        regulation_reference="state licensing",
    ),
]

US_TN = [
    RuleSeed(
        market="US-TN",
        code="us-tn.free_bet",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Free bet' prohibited in TN",
        message="TN Sports Wagering Council forbids 'free bet' language in advertising.",
        suggested_fix="Transcreate the CTA — see brand glossary for TN alternatives.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["free bet", "free wager"]},
        },
        regulation_reference="TN Sports Wagering Advisory Council Rule",
        reason_required_by_default=True,
    ),
]


# ---------------- BR ------------------------------------------------------

BR = [
    RuleSeed(
        market="BR",
        code="br.responsible_play",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="Responsible-play notice required in pt-BR",
        message="BR ads require 'Jogue com responsabilidade' or equivalent.",
        suggested_fix="Inject notice via overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.br_warning"}},
        regulation_reference="Lei 14.790/2023",
    ),
    RuleSeed(
        market="BR",
        code="br.pt_pt_vocab",
        category=RuleCategory.forbidden_word,
        severity=Severity.warning,
        title="European-Portuguese vocabulary detected",
        message="BR must use pt-BR vocabulary, not pt-PT.",
        suggested_fix="Re-translate to pt-BR.",
        trigger={
            "type": "regex",
            "conditions": {
                "pattern": r"\b(?:pequeno-almoço|autocarro|comboio|telemóvel)\b",
                "ignorecase": True,
            },
        },
        regulation_reference="internal pt-BR standard",
    ),
]


# ---------------- PH ------------------------------------------------------

PH = [
    RuleSeed(
        market="PH",
        code="ph.pagcor_license",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="PAGCOR license number required",
        message="PAGCOR-licensed ads must show license number.",
        suggested_fix="Inject license number via overlay.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.pagcor_license"}},
        regulation_reference="PAGCOR Charter",
    ),
]


# ---------------- IN ------------------------------------------------------

IN = [
    RuleSeed(
        market="IN",
        code="in.asci_warning",
        category=RuleCategory.required_element,
        severity=Severity.critical,
        title="ASCI full warning text required",
        message="IN ads must carry the full ASCI warning covering ~20% area.",
        suggested_fix="Render the ASCI warning via overlay at the required size.",
        trigger={"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.asci_warning"}},
        regulation_reference="ASCI Guidelines 2022",
    ),
    RuleSeed(
        market="IN",
        code="in.sure_win",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Sure win' / 'easy money' prohibited",
        message="ASCI prohibits skill-game = sure-win framing.",
        suggested_fix="Remove/rephrase.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["sure win", "guaranteed win", "easy money", "no risk"]},
        },
        regulation_reference="ASCI Guidelines",
        reason_required_by_default=True,
    ),
]


# ---------------- NG ------------------------------------------------------

NG = [
    RuleSeed(
        market="NG",
        code="ng.no_guaranteed_win",
        category=RuleCategory.forbidden_word,
        severity=Severity.critical,
        title="'Guaranteed win' / 'no risk' prohibited",
        message="LSLGA / NLRC prohibit guaranteed-outcome or no-risk framing.",
        suggested_fix="Replace with neutral language.",
        trigger={
            "type": "text_match",
            "conditions": {
                "phrases": ["guaranteed win", "no risk", "easy money", "sure thing"]
            },
        },
        regulation_reference="LSLGA 2021 / NLRC advertising guidance",
        reason_required_by_default=True,
    ),
    RuleSeed(
        market="NG-LA",
        code="ng-la.withholding_tax_disclosure",
        category=RuleCategory.required_element,
        severity=Severity.warning,
        title="Withholding-tax disclosure (Lagos 2026)",
        message="If the ad discusses payouts, disclose Lagos 5% withholding tax.",
        suggested_fix="Add disclosure in footer copy.",
        trigger={
            "type": "text_match",
            "conditions": {"phrases": ["payout", "winnings", "cash out"], "applies_to_roles": ["body", "headline", "cta"]},
        },
        regulation_reference="LSLGA 2026 tax directive",
    ),
    RuleSeed(
        market="NG",
        code="ng.school_proximity",
        category=RuleCategory.platform_policy,
        severity=Severity.warning,
        title="Distribution near schools / religious sites",
        message="Distribution metadata must exclude schools / churches / mosques.",
        suggested_fix="Mark platform_metadata with proximity exclusions.",
        trigger={
            "type": "metadata_check",
            "conditions": {"op": "required", "field": "distribution.excludes_sensitive_sites"},
        },
        regulation_reference="LSLGA / NLRC advertising rules",
    ),
]


ALL_DEFAULT_RULES: list[RuleSeed] = [
    *CROSS_MARKET,
    *UK,
    *DE,
    *FR,
    *US_FEDERAL,
    *US_TN,
    *BR,
    *PH,
    *IN,
    *NG,
]
