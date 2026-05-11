from fastapi import APIRouter

from app.api.v1 import (
    assets,
    auth,
    brands,
    compliance,
    debug,
    exports,
    jobs,
    markets,
    overrides,
    parsed,
    projects,
    prompts,
    reports,
    settings,
    sub_markets,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(brands.router, prefix="/brands", tags=["brands"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(sub_markets.router, prefix="/sub-markets", tags=["sub-markets"])
api_router.include_router(assets.router, prefix="/assets", tags=["assets"])
api_router.include_router(parsed.router, prefix="/parsed", tags=["parsed"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["compliance"])
api_router.include_router(overrides.router, prefix="/overrides", tags=["overrides"])
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(markets.router, prefix="/markets", tags=["markets"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
api_router.include_router(debug.router, prefix="/debug", tags=["debug"])
