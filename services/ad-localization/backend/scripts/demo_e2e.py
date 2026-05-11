"""End-to-end demo.

Exercises the full localization pipeline against a live local database
(configured via DATABASE_URL). It skips the parser (which needs Gemini for
flat images) by pre-populating a ParsedAsset + LUs directly, then runs the
orchestrator in-process so no AI keys are required.

Usage:
    cd backend
    python -m scripts.demo_e2e

Produces:
  * 1 Brand, 1 Project, 1 SourceAsset (a synthetic PNG)
  * 1 ParsedAsset with 3 Text LUs (cta, headline, disclaimer)
  * 1 LocalizationJob with 3 targets (US-NJ, UK-GB, DE)
  * 3 LocalizedAssets with compliance reports
Prints a per-target summary.
"""

from __future__ import annotations

import hashlib
import io
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.logging import configure_logging, get_logger
from app.windows_asyncio import run as selector_run
from app.models import (
    Brand,
    ComplianceCheckReport,
    LocalizableUnit,
    LocalizationJob,
    LocalizedAsset,
    ParsedAsset,
    Project,
    SourceAsset,
    SubMarket,
    User,
)
from app.models.enums import (
    JobStatus,
    LUType,
    Market,
    ParseStatus,
    SemanticRole,
    SourceType,
    TextStrategy,
    UserRole,
)
from app.security.password import hash_password
from app.services.orchestrator import run_job
from app.services.source_asset import build_storage_key
from app.storage import get_storage

configure_logging()
log = get_logger(__name__)


async def _ensure_admin(session: AsyncSession) -> User:
    existing = await session.execute(
        select(User).where(User.email == "demo-admin@example.com")
    )
    u = existing.scalar_one_or_none()
    if u is not None:
        return u
    u = User(
        email="demo-admin@example.com",
        name="Demo Admin",
        password_hash=hash_password("demo"),
        primary_role=UserRole.system_admin,
        is_system_admin=True,
    )
    session.add(u)
    await session.flush()
    return u


async def _ensure_brand(session: AsyncSession, admin: User) -> Brand:
    result = await session.execute(select(Brand).where(Brand.slug == "demo-brand"))
    b = result.scalar_one_or_none()
    if b is not None:
        return b
    b = Brand(
        name="Demo Brand",
        slug="demo-brand",
        restrictions={
            "forbidden_elements": [
                {"element": "alcohol", "reason": "cross-market safety", "severity": "warning"}
            ]
        },
        voice={
            "attributes": ["confident", "inclusive"],
            "personality_description": "Direct and factual sports-betting brand.",
        },
    )
    session.add(b)
    await session.flush()
    return b


async def _ensure_project(session: AsyncSession, brand: Brand, admin: User) -> Project:
    result = await session.execute(
        select(Project).where(Project.brand_id == brand.id, Project.name == "Demo Project")
    )
    p = result.scalar_one_or_none()
    if p is not None:
        return p
    p = Project(brand_id=brand.id, name="Demo Project", created_by=admin.id)
    session.add(p)
    await session.flush()
    return p


def _make_source_png() -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (1200, 900), (28, 30, 36))
    draw = ImageDraw.Draw(img)
    for candidate in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "arial.ttf"):
        try:
            title_font = ImageFont.truetype(candidate, size=96)
            body_font = ImageFont.truetype(candidate, size=44)
            small_font = ImageFont.truetype(candidate, size=22)
            break
        except OSError:
            continue
    else:
        title_font = body_font = small_font = ImageFont.load_default()

    draw.text((60, 160), "BET ON THE GAME", fill=(245, 245, 245), font=title_font)
    draw.text((60, 380), "Place your bet now", fill=(200, 200, 230), font=body_font)
    draw.text(
        (60, 820),
        "18+ only. T&Cs apply. begambleaware.org",
        fill=(180, 180, 180),
        font=small_font,
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _create_source(session: AsyncSession, brand: Brand, project: Project, admin: User) -> SourceAsset:
    data = _make_source_png()
    asset_id = uuid.uuid4()
    key = build_storage_key(brand.id, project.id, asset_id, ".png")
    storage = get_storage()
    await storage.put(key, data, content_type="image/png")
    source = SourceAsset(
        id=asset_id,
        project_id=project.id,
        brand_id=brand.id,
        uploaded_by=admin.id,
        source_type=SourceType.png,
        original_filename="demo-source.png",
        storage_key=key,
        source_file_hash=hashlib.sha256(data).hexdigest(),
        size_bytes=len(data),
        has_editable_layers=False,
        file_metadata={"dimensions": {"width": 1200, "height": 900}},
        tags=["demo"],
        parse_status=ParseStatus.parsed,
    )
    session.add(source)
    await session.flush()
    return source


async def _create_parsed(session: AsyncSession, source: SourceAsset) -> ParsedAsset:
    parsed = ParsedAsset(
        source_asset_id=source.id,
        parse_method="demo_fixture",
        parse_model_used=None,
        parse_confidence=1.0,
        parse_warnings=[],
        structural_metadata={"dimensions": {"width": 1200, "height": 900}},
        parsed_at=datetime.now(timezone.utc),
    )
    session.add(parsed)
    await session.flush()

    lus = [
        LocalizableUnit(
            parsed_asset_id=parsed.id,
            lu_type=LUType.text,
            source_content={"text": "BET ON THE GAME", "language": "en"},
            source_location={"type": "image_region", "bbox": [60, 160, 1100, 110]},
            semantic_role=SemanticRole.headline,
            default_strategy=TextStrategy.keep_original.value,
            parser_confidence=0.95,
        ),
        LocalizableUnit(
            parsed_asset_id=parsed.id,
            lu_type=LUType.text,
            source_content={"text": "Place your bet now", "language": "en"},
            source_location={"type": "image_region", "bbox": [60, 380, 900, 60]},
            semantic_role=SemanticRole.cta,
            default_strategy=TextStrategy.keep_original.value,
            parser_confidence=0.95,
        ),
        LocalizableUnit(
            parsed_asset_id=parsed.id,
            lu_type=LUType.text,
            source_content={"text": "18+ only. T&Cs apply. begambleaware.org", "language": "en"},
            source_location={"type": "image_region", "bbox": [60, 820, 1080, 30]},
            semantic_role=SemanticRole.disclaimer,
            default_strategy=TextStrategy.keep_original.value,
            parser_confidence=0.95,
        ),
    ]
    for lu in lus:
        session.add(lu)
    await session.flush()
    return parsed


async def _create_job(
    session: AsyncSession,
    source: SourceAsset,
    admin: User,
    parsed: ParsedAsset,
) -> LocalizationJob:
    targets = ["US-NJ", "UK-GB", "DE"]
    matrix: dict = {}
    lu_ids = (
        await session.execute(
            select(LocalizableUnit.id).where(LocalizableUnit.parsed_asset_id == parsed.id)
        )
    ).scalars().all()
    for lu_id in lu_ids:
        row: dict = {}
        for t in targets:
            # Demo keeps everything as keep_original so no AI keys are needed.
            row[t] = {"strategy": TextStrategy.keep_original.value}
        matrix[str(lu_id)] = row
    job = LocalizationJob(
        source_asset_id=source.id,
        requested_by=admin.id,
        target_markets=targets,
        strategy_matrix=matrix,
        status=JobStatus.queued,
        started_at=None,
    )
    session.add(job)
    await session.flush()
    return job


async def main() -> None:
    async with SessionLocal() as session:
        admin = await _ensure_admin(session)
        brand = await _ensure_brand(session, admin)
        project = await _ensure_project(session, brand, admin)

        # Verify at least one sub-market is seeded; nudge the user if not.
        sub_count = (
            await session.execute(select(SubMarket).where(SubMarket.id == "US-NJ"))
        ).scalar_one_or_none()
        if sub_count is None:
            print("Sub-markets not seeded — run `python -m app.seed.run` first")
            return

        source = await _create_source(session, brand, project, admin)
        parsed = await _create_parsed(session, source)

        job = await _create_job(session, source, admin, parsed)
        await session.commit()

        print(f"source={source.id}  parsed={parsed.id}  job={job.id}")
        print("orchestrator running…")
        job = await run_job(session, job.id)
        await session.commit()

        # Print summary
        localized_rows = (
            await session.execute(
                select(LocalizedAsset).where(LocalizedAsset.localization_job_id == job.id)
            )
        ).scalars().all()
        print(f"\nJob status: {job.status.value}")
        for a in localized_rows:
            tag = a.target_sub_market or a.target_market.value
            findings = "-"
            if a.compliance_report_id is not None:
                report = await session.get(ComplianceCheckReport, a.compliance_report_id)
                if report is not None:
                    findings = f"{report.overall_status} ({len(report.findings)} findings)"
            print(
                f"  [{tag:6}] status={a.status.value:22} "
                f"overlay={a.compliance_overlay_applied}  compliance={findings}"
            )


if __name__ == "__main__":
    selector_run(main())
