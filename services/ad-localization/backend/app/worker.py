"""Procrastinate worker launcher with Windows SelectorEventLoop.

Same rationale as ``serve.py`` — Python 3.14 deprecated the asyncio policy API,
so we pass ``loop_factory`` to ``asyncio.run`` explicitly.
"""

from __future__ import annotations

import asyncio
import selectors
import sys

from app.tasks.app import app as procrastinate_app


async def _run() -> None:
    async with procrastinate_app.open_async():
        await procrastinate_app.run_worker_async(
            concurrency=2,
            queues=None,  # all queues
        )


def main() -> None:
    if sys.platform == "win32":
        def _factory():
            return asyncio.SelectorEventLoop(selectors.SelectSelector())

        asyncio.run(_run(), loop_factory=_factory)
    else:
        asyncio.run(_run())


if __name__ == "__main__":
    main()
