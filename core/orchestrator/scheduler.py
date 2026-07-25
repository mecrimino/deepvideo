"""
Scheduler (19.5 parallel execution + 19.6 dependency graph).

Runs independent tasks concurrently up to a parallelism cap, and executes a
dependency DAG level-by-level (a task starts only when its dependencies are done)
so asset retrieval, audio and graphics run at the same time — cutting total time.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable


class Scheduler:
    def __init__(self, parallelism: int = 8) -> None:
        self.sem = asyncio.Semaphore(max(1, parallelism))

    async def run_parallel(self, thunks: list[Callable[[], Awaitable]]) -> list:
        async def _guard(thunk):
            async with self.sem:
                try:
                    return await thunk()
                except Exception:
                    return None
        return await asyncio.gather(*[_guard(t) for t in thunks])

    async def run_dag(self, tasks: dict, deps: dict, runner: Callable) -> dict:
        """Execute a DAG: tasks={id: spec}, deps={id: [prereq ids]} (19.6)."""
        results: dict = {}
        done: set = set()
        pending = set(tasks)
        while pending:
            ready = [i for i in pending if all(d in done for d in deps.get(i, []))]
            if not ready:
                break  # unmet dependency / cycle
            outcomes = await self.run_parallel([lambda i=i: runner(i, tasks[i]) for i in ready])
            for i, out in zip(ready, outcomes):
                results[i] = out
                done.add(i)
                pending.discard(i)
        return results
