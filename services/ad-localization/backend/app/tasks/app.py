"""procrastinate app + task registry.

Run the worker with:

    procrastinate --app=app.tasks.app worker

Tasks here are stubs for Phase 1. Real implementations land in Phase 2/3.
"""

from __future__ import annotations

import uuid

from procrastinate import App, PsycopgConnector

from app.config import get_settings
from app.logging import get_logger

log = get_logger(__name__)

_settings = get_settings()

# procrastinate takes a sync DSN via psycopg
connector = PsycopgConnector(
    conninfo=_settings.database_url.replace("postgresql+psycopg", "postgresql")
)

app = App(connector=connector)


@app.task(queue="parse")
async def parse_source_asset(source_asset_id: str) -> dict:
    """Drives PSD / multimodal / video parsing and persists LUs + structural metadata."""
    from app.db import SessionLocal
    from app.services.parse import parse_and_persist

    log.info("task.parse_source_asset.start", source_asset_id=source_asset_id)
    asset_uuid = uuid.UUID(source_asset_id)
    async with SessionLocal() as session:
        parsed = await parse_and_persist(session, asset_uuid)
    return {
        "status": "parsed",
        "source_asset_id": source_asset_id,
        "parsed_asset_id": str(parsed.id),
        "lu_count": len(parsed.localizable_units) if parsed.localizable_units is not None else None,
    }


@app.task(queue="localize")
async def run_localization_job(job_id: str) -> dict:
    """Orchestrate strategy apply + compose + overlay + compliance check per target."""
    from app.db import SessionLocal
    from app.services.orchestrator import run_job

    log.info("task.run_localization_job.start", job_id=job_id)
    jid = uuid.UUID(job_id)
    async with SessionLocal() as session:
        job = await run_job(session, jid)
    return {
        "status": job.status.value,
        "job_id": job_id,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@app.task(queue="compliance")
async def run_compliance_check(localized_asset_id: str) -> dict:
    """Re-run the compliance check for an existing LocalizedAsset."""
    from app.db import SessionLocal
    from app.services.compliance_check import run_check

    log.info("task.run_compliance_check.start", localized_asset_id=localized_asset_id)
    aid = uuid.UUID(localized_asset_id)
    async with SessionLocal() as session:
        report, findings, effective = await run_check(session, aid)
        await session.commit()
    return {
        "status": report.overall_status,
        "findings": len(findings),
        "effective_rules": len(effective),
    }


@app.task(queue="ai", retry=5)
async def poll_veo_operation(localized_asset_id: str, operation_name: str) -> dict:
    """Poll a Veo 3.1 operation; re-schedules itself if still running."""
    from app.db import SessionLocal
    from app.services.video_audio_regen import poll_and_complete

    aid = uuid.UUID(localized_asset_id)
    async with SessionLocal() as session:
        done = await poll_and_complete(
            session, localized_asset_id=aid, operation_name=operation_name
        )
        await session.commit()
    if not done:
        await poll_veo_operation.configure(schedule_in={"seconds": 30}).defer_async(
            localized_asset_id=localized_asset_id, operation_name=operation_name
        )
    return {"done": done, "operation": operation_name}
