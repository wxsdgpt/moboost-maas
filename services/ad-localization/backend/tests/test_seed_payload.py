"""Offline sanity checks on the sub-market seed payload (no DB)."""

from app.models.enums import Market, OperationalStatus, SubMarketHandler
from app.seed.markets import all_sub_market_seeds


def test_eight_parent_markets() -> None:
    seeds = all_sub_market_seeds()
    markets = {s.parent_market for s in seeds}
    assert markets == {
        Market.US,
        Market.UK,
        Market.PH,
        Market.IN_,
        Market.BR,
        Market.FR,
        Market.DE,
        Market.NG,
    }


def test_us_uses_per_state_operating() -> None:
    us = [s for s in all_sub_market_seeds() if s.parent_market is Market.US]
    assert len(us) >= 38  # Tier 1+2+3 + blocked baseline
    assert {s.handler for s in us} == {SubMarketHandler.per_state_operating}


def test_us_has_blocked_states() -> None:
    us = [s for s in all_sub_market_seeds() if s.parent_market is Market.US]
    blocked = {s.region_code for s in us if s.operational_status is OperationalStatus.blocked}
    assert {"CA", "TX", "UT", "HI"}.issubset(blocked)


def test_ng_priority_subs() -> None:
    ng = {s.id: s for s in all_sub_market_seeds() if s.parent_market is Market.NG}
    assert ng["NG-LA"].operational_status is OperationalStatus.active
    assert ng["NG-FCT"].operational_status is OperationalStatus.active
    assert ng["NG-LA"].regulatory_body and "LSLGA" in ng["NG-LA"].regulatory_body
    assert ng["NG-FCT"].regulatory_body and "NLRC" in ng["NG-FCT"].regulatory_body


def test_uk_dual() -> None:
    uk = {s.id: s for s in all_sub_market_seeds() if s.parent_market is Market.UK}
    assert uk["UK-GB"].operational_status is OperationalStatus.active
    assert uk["UK-NI"].operational_status is OperationalStatus.limited


def test_de_has_time_window() -> None:
    de = next(s for s in all_sub_market_seeds() if s.parent_market is Market.DE)
    assert "21:00" in de.prompt_overrides.get("time_window", "")


def test_in_blocklist_handler() -> None:
    in_ = next(s for s in all_sub_market_seeds() if s.parent_market is Market.IN_)
    assert in_.handler is SubMarketHandler.blocklist
