"""Uvicorn launcher that forces a SelectorEventLoop on Windows.

Python 3.14 deprecated the asyncio policy API; the only reliable path to a
selector loop is passing ``loop_factory`` to ``asyncio.run``. This module
constructs a ``uvicorn.Server`` and runs it that way.
"""

from __future__ import annotations

import selectors
import sys

import uvicorn

from app.main import app


def main() -> None:
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        loop="asyncio",
    )
    server = uvicorn.Server(config)
    if sys.platform == "win32":
        import asyncio

        def _factory():
            return asyncio.SelectorEventLoop(selectors.SelectSelector())

        asyncio.run(server.serve(), loop_factory=_factory)
    else:
        server.run()


if __name__ == "__main__":
    main()
