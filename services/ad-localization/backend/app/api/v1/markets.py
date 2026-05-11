"""Static market reference endpoint.

Returns the 8 supported markets with metadata the frontend needs for
the market picker grid.  Data is hard-coded because it mirrors the
Market enum and the docs/PROJECT.md spec — no DB query needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User

router = APIRouter()

MARKETS = [
    {
        "code": "US",
        "name": "United States",
        "language": "en-US",
        "region": "North America",
        "sub_market_handler": "per_state_operating",
        "complexity": "high",
    },
    {
        "code": "UK",
        "name": "United Kingdom",
        "language": "en-GB",
        "region": "Europe",
        "sub_market_handler": "optional_dual",
        "complexity": "medium",
    },
    {
        "code": "PH",
        "name": "Philippines",
        "language": "tl/en",
        "region": "Asia-Pacific",
        "sub_market_handler": "federal_only",
        "complexity": "low",
    },
    {
        "code": "IN",
        "name": "India",
        "language": "hi/en",
        "region": "Asia-Pacific",
        "sub_market_handler": "blocklist",
        "complexity": "high",
    },
    {
        "code": "BR",
        "name": "Brazil",
        "language": "pt-BR",
        "region": "South America",
        "sub_market_handler": "federal_placeholder",
        "complexity": "low",
    },
    {
        "code": "FR",
        "name": "France",
        "language": "fr",
        "region": "Europe",
        "sub_market_handler": "federal_only",
        "complexity": "medium",
    },
    {
        "code": "DE",
        "name": "Germany",
        "language": "de",
        "region": "Europe",
        "sub_market_handler": "federal_only",
        "complexity": "high",
    },
    {
        "code": "NG",
        "name": "Nigeria",
        "language": "en-NG",
        "region": "Africa",
        "sub_market_handler": "per_state_operating",
        "complexity": "medium",
    },
]


@router.get("")
async def list_markets(
    _user: User = Depends(get_current_user),
) -> dict:
    """Return the 8 supported localization markets."""
    return {"markets": MARKETS}
