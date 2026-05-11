"""Insert (or refresh) system-default compliance rules from compliance_rules.py."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.logging import get_logger
from app.models import ComplianceRule
from app.seed.compliance_rules import ALL_DEFAULT_RULES

log = get_logger(__name__)


async def seed_rules(session: AsyncSession) -> None:
    existing = {
        row[0]
        for row in (await session.execute(select(ComplianceRule.code))).all()
    }
    created = 0
    updated = 0
    for seed in ALL_DEFAULT_RULES:
        if seed.code in existing:
            existing_row_result = await session.execute(
                select(ComplianceRule).where(ComplianceRule.code == seed.code)
            )
            row = existing_row_result.scalar_one()
            row.market = seed.market
            row.category = seed.category
            row.severity = seed.severity
            row.title = seed.title
            row.message = seed.message
            row.suggested_fix = seed.suggested_fix
            row.trigger = seed.trigger
            row.regulation_reference = seed.regulation_reference
            row.reason_required_by_default = seed.reason_required_by_default
            row.is_active = True
            row.version = row.version + 1
            updated += 1
        else:
            session.add(
                ComplianceRule(
                    market=seed.market,
                    code=seed.code,
                    category=seed.category,
                    severity=seed.severity,
                    title=seed.title,
                    message=seed.message,
                    suggested_fix=seed.suggested_fix,
                    trigger=seed.trigger,
                    regulation_reference=seed.regulation_reference,
                    reason_required_by_default=seed.reason_required_by_default,
                )
            )
            created += 1
    log.info("seed.rules", created=created, updated=updated)
