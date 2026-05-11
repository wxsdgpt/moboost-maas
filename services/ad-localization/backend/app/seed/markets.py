"""Seed data for Market / SubMarket / blocked-region metadata.

Follows SUB_MARKETS.md:
- US: ~38 legal sports-betting states under PER_STATE_OPERATING. V1 activates Tier 1
  rule packs; Tier 2/3 are data-present but rule-minimal. Blocked states (CA/TX/UT/HI
  etc.) appear with operational_status='blocked' and feed distribution geo-fencing.
- NG: PER_STATE_OPERATING. V1 active: NG-LA (Lagos/LSLGA), NG-FCT (FCT/NLRC).
  Other states placeholder.
- UK: OPTIONAL_DUAL. UK-GB active default, UK-NI opt-in.
- IN: BLOCKLIST. Single 'IN' submarket + state blocklist/allowlist JSON.
- BR: FEDERAL_PLACEHOLDER (prepared for future state subdivision).
- DE / FR / PH: FEDERAL_ONLY.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.models.enums import Market, OperationalStatus, SubMarketHandler

TODAY = date(2026, 4, 20)


@dataclass
class SubMarketSeed:
    id: str
    parent_market: Market
    handler: SubMarketHandler
    display_name: str
    region_code: str | None = None
    operational_status: OperationalStatus = OperationalStatus.active
    legalization_date: date | None = None
    last_reviewed_at: date | None = TODAY
    regulatory_body: str | None = None
    law_reference: str | None = None
    min_age: int | None = None
    license_number_format: str | None = None
    rg_hotline: str | None = None
    rg_logo_url: str | None = None
    mandatory_disclaimers: list = field(default_factory=list)
    content_language: str | None = None
    currency: str | None = None
    prompt_overrides: dict = field(default_factory=dict)
    notes: str | None = None


# -------- United States -------------------------------------------------------

US_TIER_1 = [
    ("NJ", "New Jersey", 21, "NJ Division of Gaming Enforcement"),
    ("PA", "Pennsylvania", 21, "Pennsylvania Gaming Control Board"),
    ("NY", "New York", 21, "New York State Gaming Commission"),
    ("MI", "Michigan", 21, "Michigan Gaming Control Board"),
    ("IL", "Illinois", 21, "Illinois Gaming Board"),
    ("MA", "Massachusetts", 21, "Massachusetts Gaming Commission"),
    ("OH", "Ohio", 21, "Ohio Casino Control Commission"),
    ("CO", "Colorado", 21, "Colorado Limited Gaming Control Commission"),
]

US_TIER_2 = [
    ("TN", "Tennessee", 21, "Sports Wagering Council"),
    ("VA", "Virginia", 21, "Virginia Lottery"),
    ("IN", "Indiana", 21, "Indiana Gaming Commission"),
    ("AZ", "Arizona", 21, "Arizona Department of Gaming"),
    ("MD", "Maryland", 21, "Maryland Lottery and Gaming Control Agency"),
    ("CT", "Connecticut", 21, "Connecticut Department of Consumer Protection"),
    ("IA", "Iowa", 21, "Iowa Racing and Gaming Commission"),
    ("LA", "Louisiana", 21, "Louisiana Gaming Control Board"),
    ("KS", "Kansas", 21, "Kansas Racing and Gaming Commission"),
    ("KY", "Kentucky", 18, "Kentucky Horse Racing Commission"),
]

# Tier 3 — remaining ~20 active legal states with baseline rule packs
US_TIER_3 = [
    ("NH", "New Hampshire", 18),
    ("RI", "Rhode Island", 18),
    ("NV", "Nevada", 21),
    ("DE", "Delaware", 21),
    ("WV", "West Virginia", 21),
    ("AR", "Arkansas", 21),
    ("MS", "Mississippi", 21),
    ("MT", "Montana", 18),
    ("WY", "Wyoming", 18),
    ("OR", "Oregon", 21),
    ("WA", "Washington", 18),
    ("DC", "District of Columbia", 18),
    ("ME", "Maine", 21),
    ("VT", "Vermont", 21),
    ("ND", "North Dakota", 21),
    ("SD", "South Dakota", 21),
    ("NC", "North Carolina", 21),
    ("NE", "Nebraska", 21),
    ("FL", "Florida", 21),
    ("NM", "New Mexico", 21),
]

# States with explicit sports-betting prohibitions — produce blocked entries for geo-fencing
US_BLOCKED = [
    ("CA", "California", "state constitution / ongoing legislative dispute"),
    ("TX", "Texas", "state statute prohibits online sports betting"),
    ("UT", "Utah", "state constitution prohibits all gambling"),
    ("HI", "Hawaii", "state statute prohibits all gambling"),
    ("AL", "Alabama", "no authorizing statute"),
    ("AK", "Alaska", "no authorizing statute"),
    ("GA", "Georgia", "no authorizing statute"),
    ("ID", "Idaho", "state statute prohibits sports betting"),
    ("MN", "Minnesota", "no authorizing statute"),
    ("MO", "Missouri", "gap pending operational rules"),
    ("OK", "Oklahoma", "tribal-only, commercial sports betting prohibited"),
    ("SC", "South Carolina", "state constitution prohibits"),
    ("WI", "Wisconsin", "tribal-only"),
]


def _us_submarkets() -> list[SubMarketSeed]:
    out: list[SubMarketSeed] = []
    for code, name, min_age, body in US_TIER_1:
        out.append(
            SubMarketSeed(
                id=f"US-{code}",
                parent_market=Market.US,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.active,
                regulatory_body=body,
                min_age=min_age,
                rg_hotline="1-800-GAMBLER",
                content_language="en-US",
                currency="USD",
                mandatory_disclaimers=[
                    {
                        "text": f"{min_age}+ only. If you or someone you know has a gambling problem, call 1-800-GAMBLER.",
                        "placement": "footer",
                        "language": "en",
                    }
                ],
                notes="Tier 1 rule pack — primary V1 coverage target.",
            )
        )
    for code, name, min_age, body in US_TIER_2:
        out.append(
            SubMarketSeed(
                id=f"US-{code}",
                parent_market=Market.US,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.active,
                regulatory_body=body,
                min_age=min_age,
                rg_hotline="1-800-GAMBLER",
                content_language="en-US",
                currency="USD",
                notes="Tier 2 rule pack.",
            )
        )
    for code, name, min_age in US_TIER_3:
        out.append(
            SubMarketSeed(
                id=f"US-{code}",
                parent_market=Market.US,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.active,
                min_age=min_age,
                rg_hotline="1-800-GAMBLER",
                content_language="en-US",
                currency="USD",
                notes="Tier 3 baseline rule pack.",
            )
        )
    for code, name, reason in US_BLOCKED:
        out.append(
            SubMarketSeed(
                id=f"US-{code}",
                parent_market=Market.US,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.blocked,
                content_language="en-US",
                currency="USD",
                notes=f"Blocked from distribution: {reason}",
            )
        )
    return out


# -------- Nigeria --------------------------------------------------------------

NG_ACTIVE = [
    (
        "LA",
        "Lagos",
        "Lagos State Lotteries and Gaming Authority (LSLGA)",
        "Lagos State Lotteries and Gaming Authority Law 2021",
        r"LSLGA-\d{5}",
        "LSLGA enforces 5% withholding tax on player winnings from Feb 2026.",
    ),
    (
        "FCT",
        "Federal Capital Territory",
        "National Lottery Regulatory Commission (NLRC)",
        "National Lottery Act 2005",
        r"NLRC-\d{4}-\d{4}",
        "Post-Nov-2024 Supreme Court ruling NLRC retains only FCT jurisdiction.",
    ),
]

NG_PLACEHOLDER = [
    ("OY", "Oyo"),
    ("RI", "Rivers"),
    ("KN", "Kano"),
    ("ED", "Edo"),
    ("AN", "Anambra"),
    ("AB", "Abuja-Municipal"),
    ("KD", "Kaduna"),
]


def _ng_submarkets() -> list[SubMarketSeed]:
    out: list[SubMarketSeed] = []
    for code, name, body, law, license_fmt, note in NG_ACTIVE:
        out.append(
            SubMarketSeed(
                id=f"NG-{code}",
                parent_market=Market.NG,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.active,
                regulatory_body=body,
                law_reference=law,
                min_age=18,
                license_number_format=license_fmt,
                rg_hotline="0800-GAMBLE-NG",
                content_language="en-NG",
                currency="NGN",
                mandatory_disclaimers=[
                    {"text": "18+ only. Play responsibly.", "placement": "footer", "language": "en"}
                ],
                prompt_overrides={
                    "forbidden_terms": ["guaranteed win", "no risk", "easy money", "sure thing"],
                    "required_tone_adjustments": [
                        "avoid targeting youth culture",
                        "football references generic (avoid active Super Eagles players without license)",
                    ],
                },
                notes=note,
            )
        )
    for code, name in NG_PLACEHOLDER:
        out.append(
            SubMarketSeed(
                id=f"NG-{code}",
                parent_market=Market.NG,
                handler=SubMarketHandler.per_state_operating,
                display_name=name,
                region_code=code,
                operational_status=OperationalStatus.inactive,
                content_language="en-NG",
                currency="NGN",
                notes="Data-model placeholder; regulatory framework forming.",
            )
        )
    return out


# -------- United Kingdom -------------------------------------------------------

def _uk_submarkets() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="UK-GB",
            parent_market=Market.UK,
            handler=SubMarketHandler.optional_dual,
            display_name="Great Britain",
            region_code="GB",
            operational_status=OperationalStatus.active,
            regulatory_body="Gambling Commission (UKGC)",
            law_reference="Gambling Act 2005; CAP Code",
            min_age=18,
            rg_hotline="0808 8020 133 (GamCare)",
            content_language="en-GB",
            currency="GBP",
            mandatory_disclaimers=[
                {
                    "text": "18+ only. BeGambleAware.org",
                    "placement": "footer",
                    "language": "en",
                }
            ],
            notes="Default UK sub-market. England + Scotland + Wales.",
        ),
        SubMarketSeed(
            id="UK-NI",
            parent_market=Market.UK,
            handler=SubMarketHandler.optional_dual,
            display_name="Northern Ireland",
            region_code="NI",
            operational_status=OperationalStatus.limited,
            regulatory_body="Department for Communities (NI)",
            law_reference="Betting, Gaming, Lotteries and Amusements (NI) Order 1985",
            min_age=18,
            content_language="en-GB",
            currency="GBP",
            notes="Separate BGLA Order. Brands must opt-in.",
        ),
    ]


# -------- India (blocklist) ----------------------------------------------------

def _in_submarkets() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="IN",
            parent_market=Market.IN_,
            handler=SubMarketHandler.blocklist,
            display_name="India",
            region_code=None,
            operational_status=OperationalStatus.active,
            regulatory_body="ASCI (self-regulation); state gambling statutes",
            law_reference="ASCI Guidelines 2022; state gambling statutes",
            min_age=18,
            rg_hotline=None,
            content_language="en-IN",
            currency="INR",
            mandatory_disclaimers=[
                {
                    "text": "This product involves financial risk and may be addictive. Please play responsibly and at your own risk. 18+ only.",
                    "placement": "footer",
                    "language": "en",
                    "size_hint": "ASCI mandates ~20% area for fantasy/real-money gaming ads",
                }
            ],
            prompt_overrides={
                "forbidden_terms": ["risk-free", "guaranteed winnings", "easy money"],
                "required_tone_adjustments": [
                    "avoid targeting under-18; avoid cartoon/childlike imagery",
                ],
            },
            notes=(
                "One India asset; state blocklist applied at distribution. "
                "Blocked states: TN, AP, TS, OR, AS, NL. "
                "Karnataka (KA) defaults to blocked (volatile)."
            ),
        ),
    ]


# -------- BR / DE / FR / PH (federal-only or placeholder) ---------------------

def _br_submarket() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="BR",
            parent_market=Market.BR,
            handler=SubMarketHandler.federal_placeholder,
            display_name="Brazil",
            operational_status=OperationalStatus.active,
            regulatory_body="Secretariat of Prizes and Bets (SPA)",
            law_reference="Lei 14.790/2023",
            min_age=18,
            rg_hotline=None,
            content_language="pt-BR",
            currency="BRL",
            mandatory_disclaimers=[
                {
                    "text": "Jogue com responsabilidade. 18+.",
                    "placement": "footer",
                    "language": "pt-BR",
                }
            ],
            notes=(
                "Federal SPA license in V1. State-level rules forming "
                "(Rio de Janeiro, São Paulo) — monitor quarterly."
            ),
        ),
    ]


def _de_submarket() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="DE",
            parent_market=Market.DE,
            handler=SubMarketHandler.federal_only,
            display_name="Germany",
            operational_status=OperationalStatus.active,
            regulatory_body="Gemeinsame Glücksspielbehörde der Länder (GGL)",
            law_reference="Glücksspielstaatsvertrag 2021 (GlüStV)",
            min_age=18,
            content_language="de-DE",
            currency="EUR",
            mandatory_disclaimers=[
                {
                    "text": "Spielen kann süchtig machen. Hilfe unter www.buwei.de (Tel. 0800 1 37 27 00).",
                    "placement": "footer",
                    "language": "de",
                }
            ],
            prompt_overrides={
                "forbidden_terms": ["risikofrei", "garantierter Gewinn"],
                "required_tone_adjustments": [
                    "calm audio tone, no excitement spikes",
                    "no display of specific odds numerics",
                ],
                "time_window": "21:00-06:00 DE local",
            },
            notes="Strict: time-window metadata, odds display restriction, calm audio.",
        ),
    ]


def _fr_submarket() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="FR",
            parent_market=Market.FR,
            handler=SubMarketHandler.federal_only,
            display_name="France",
            operational_status=OperationalStatus.active,
            regulatory_body="Autorité nationale des jeux (ANJ)",
            law_reference="Code de la sécurité intérieure, art. L.320-*",
            min_age=18,
            content_language="fr-FR",
            currency="EUR",
            mandatory_disclaimers=[
                {
                    "text": "Jouer comporte des risques : endettement, dépendance... Appelez le 09 74 75 13 13 (appel non surtaxé).",
                    "placement": "footer",
                    "language": "fr",
                }
            ],
            notes="ANJ advertising code; mandatory health warning text.",
        ),
    ]


def _ph_submarket() -> list[SubMarketSeed]:
    return [
        SubMarketSeed(
            id="PH",
            parent_market=Market.PH,
            handler=SubMarketHandler.federal_only,
            display_name="Philippines",
            operational_status=OperationalStatus.active,
            regulatory_body="PAGCOR",
            law_reference="PAGCOR Charter (PD 1869, as amended)",
            min_age=21,
            content_language="en-PH",
            currency="PHP",
            mandatory_disclaimers=[
                {"text": "21+ only. Game responsibly.", "placement": "footer", "language": "en"}
            ],
            notes="Single federal market.",
        ),
    ]


def all_sub_market_seeds() -> list[SubMarketSeed]:
    return [
        *_us_submarkets(),
        *_ng_submarkets(),
        *_uk_submarkets(),
        *_in_submarkets(),
        *_br_submarket(),
        *_de_submarket(),
        *_fr_submarket(),
        *_ph_submarket(),
    ]


# -------- IN blocklist configuration (consumed by distribution layer) ---------

IN_BLOCKLIST_CONFIG = {
    "allowlist_states": [
        {"code": "GA", "name": "Goa", "notes": "land-based casinos"},
        {"code": "SK", "name": "Sikkim", "notes": "Sikkim Online Gaming (Regulation) Act"},
        {"code": "NL", "name": "Nagaland", "notes": "skill-game licensing regime"},
    ],
    "blocklist_states": [
        {"code": "TN", "name": "Tamil Nadu", "law": "Tamil Nadu Prohibition of Online Gambling and Regulation of Online Games Act 2022", "last_updated": "2026-01-15"},
        {"code": "AP", "name": "Andhra Pradesh", "law": "AP Gaming (Amendment) Act 2020", "last_updated": "2026-01-15"},
        {"code": "TS", "name": "Telangana", "law": "Telangana Gaming (Amendment) Act 2017", "last_updated": "2026-01-15"},
        {"code": "OR", "name": "Odisha", "law": "Orissa Prevention of Gambling Act 1955", "last_updated": "2026-01-15"},
        {"code": "AS", "name": "Assam", "law": "Assam Game & Betting Act 1970", "last_updated": "2026-01-15"},
        {"code": "NL", "name": "Nagaland (online gambling)", "law": "overlaps allowlist for skill only", "last_updated": "2026-01-15"},
    ],
    "gray_zone_states": [
        {"code": "KL", "name": "Kerala"},
        {"code": "MH", "name": "Maharashtra"},
    ],
    "gray_zone_default_behavior": "allow",
    "volatile_states": [
        {"code": "KA", "name": "Karnataka", "last_updated": "2026-03-01", "current_default": "block"},
    ],
}
