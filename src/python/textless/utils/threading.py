"""Async concurrency primitives for inpainting pipelines."""

import asyncio


class PriorityLock:
    """Async lock that prioritises each ``acquire`` by numeric priority.

    License: MIT <tuxtimo@gmail.com>
    """

    class _Context:
        def __init__(self, lock: 'PriorityLock', priority: int) -> None:
            self._lock = lock
            self._priority = priority

        async def __aenter__(self):
            await self._lock.acquire(self._priority)

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            await self._lock.release()

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._acquire_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._need_to_wait = False

    async def acquire(self, priority: int) -> bool:
        async with self._lock:
            if not self._need_to_wait:
                self._need_to_wait = True
                return True
            event = asyncio.Event()
            await self._acquire_queue.put((priority, event))
        await event.wait()
        return True

    async def release(self) -> None:
        async with self._lock:
            try:
                _, event = self._acquire_queue.get_nowait()
            except asyncio.QueueEmpty:
                self._need_to_wait = False
            else:
                event.set()

    def __call__(self, priority: int) -> _Context:
        return self._Context(self, priority)


class Throttler:
    """Throttles async function calls to a fixed rate, but always executes the last call.

    Example::

        throttler = Throttler(1.0)  # 1 call/sec
        throttled = throttler.wrap(my_async_fn)
        await throttled(arg)
        await throttler.flush()
    """

    def __init__(self, rate: float) -> None:
        self.rate = rate
        self.last_called: float | None = None
        self.pending_call = None
        self.pending_task = None

    def wrap(self, func):
        async def wrapped_func(*args, **kwargs):
            return await self.__call__(func, *args, **kwargs)
        return wrapped_func

    async def __call__(self, func, *args, **kwargs):
        if self.last_called:
            elapsed = asyncio.get_event_loop().time() - self.last_called
            if elapsed < self.rate:
                if self.pending_call:
                    self.pending_call.cancel()
                self.pending_task = self.__call__(func, *args, **kwargs)
                self.pending_call = asyncio.get_event_loop().call_later(
                    self.rate - elapsed,
                    asyncio.create_task,
                    self.pending_task,
                )
                return

        self.last_called = asyncio.get_event_loop().time()
        self.pending_call = None
        self.pending_task = None
        return await func(*args, **kwargs)

    async def flush(self):
        if self.pending_call:
            self.pending_call.cancel()
            self.pending_call = None
            if self.pending_task:
                return await self.pending_task
