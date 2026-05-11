"""Idempotent seeder: default admin user + all sub-markets."""

from __future__ import annotations

import os
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.logging import configure_logging, get_logger
from app.models import SubMarket, User
from app.models.enums import UserRole
from app.security.password import hash_password
from app.seed.markets import all_sub_market_seeds
from app.seed.rules_seed import seed_rules
from app.windows_asyncio import run as selector_run

configure_logging()
log = get_logger(__name__)


async def seed_admin(session: AsyncSession) -> None:
    email = os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com")
    password = os.environ.get("SEED_ADMIN_PASSWORD", "admin")
    result = await session.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        log.info("seed.admin.skip", email=email)
        return
    admin = User(
        email=email,
        name="System Admin",
        password_hash=hash_password(password),
        primary_role=UserRole.system_admin,
        is_system_admin=True,
    )
    session.add(admin)
    log.info("seed.admin.created", email=email)


async def seed_sub_markets(session: AsyncSession) -> None:
    existing_ids = {
        row[0] for row in (await session.execute(select(SubMarket.id))).all()
    }
    created = 0
    updated = 0
    for s in all_sub_market_seeds():
        payload = asdict(s)
        if s.id in existing_ids:
            sm = await session.get(SubMarket, s.id)
            for field, value in payload.items():
                setattr(sm, field, value)
            updated += 1
        else:
            session.add(SubMarket(**payload))
            created += 1
    log.info("seed.sub_markets", created=created, updated=updated)


async def main() -> None:
    async with SessionLocal() as session:
        await seed_admin(session)
        await seed_sub_markets(session)
        await seed_rules(session)
        await session.commit()
    log.info("seed.done")


if __name__ == "__main__":
    selector_run(main())
