"""Windows asyncio compatibility shim.

psycopg async requires a SelectorEventLoop; Windows defaults to ProactorEventLoop.
``ensure_selector_loop_policy`` forces the selector policy on Windows (still
functional on Python 3.14 despite the deprecation), and ``run`` is used by
standalone scripts that don't have a daemon-installed policy yet.
"""

from __future__ import annotations

import asyncio
import selectors
import sys
import warnings
from typing import Coroutine, TypeVar

T = TypeVar("T")


def ensure_selector_loop_policy() -> None:
    """Force SelectorEventLoop on Windows. Safe to call multiple times."""
    if sys.platform != "win32":
        return
    try:
        current = asyncio.get_event_loop_policy()
    except Exception:  # noqa: BLE001
        current = None
    if isinstance(current, asyncio.WindowsSelectorEventLoopPolicy):
        return
    with warnings.catch_warnings():
        # set_event_loop_policy is deprecated in 3.14 but still works, and is
        # the only hook that affects daemons (uvicorn / procrastinate) that
        # create their own loop after import.
        warnings.simplefilter("ignore", DeprecationWarning)
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def _selector_loop_factory():
    return asyncio.SelectorEventLoop(selectors.SelectSelector())


def run(coro: Coroutine[None, None, T]) -> T:
    """``asyncio.run`` but forces a SelectorEventLoop on Windows."""
    if sys.platform == "win32":
        return asyncio.run(coro, loop_factory=_selector_loop_factory)
    return asyncio.run(coro)
