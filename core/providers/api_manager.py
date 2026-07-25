"""
API Manager (Ch20.7) — the single choke-point for every outbound cloud call.

    Agent → API Manager → Cache Check → Rate Limit → Retry → Cloud API

Responsibilities:
  * **Cache** — deterministic responses are memoised to disk (``cache/api``) so
    repeated calls cost nothing (Ch20.6 "cache everything").
  * **Retry** — transient failures retry with exponential backoff (Ch19.10).
  * **Key rotation** — a pool of free-tier keys is rotated on auth/rate errors
    (matches the OpenRouter key-rotation approach noted for this project).
  * **Rate limiting** — a simple per-host token gate avoids hammering providers.

Nothing here is provider-specific; the typed clients (llm/, search/, ...) build
on top of it.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import httpx

from core.config import get_settings
from core.utils.logging import get_logger

log = get_logger("api")


def _record_api(host: str, ms: float, status: int, url: str, method: str, ok: bool | None = None) -> None:
    """Feed the Developer Dashboard metrics (best-effort, never fatal)."""
    try:
        from core.dev.metrics import get_metrics

        get_metrics().record_api(
            host, ms, ok=(ok if ok is not None else status < 400),
            status=status, url=url, method=method,
        )
    except Exception:
        pass


def _record_rate_limit(host: str, wait_sec: float) -> None:
    """Surface rate-limit waits on the Developer Dashboard (best-effort)."""
    try:
        from core.dev.metrics import get_metrics

        get_metrics().record_rate_limit(host, wait_sec)
    except Exception:
        pass


def _record_download(name: str, got: int, total: int, elapsed: float, done: bool = False) -> None:
    try:
        from core.dev.metrics import get_metrics

        pct = (got / total * 100) if total else 0.0
        speed = (got / elapsed) if elapsed > 0 else 0.0
        get_metrics().record_download(
            name, pct=pct, speed_bps=speed,
            remaining_bytes=max(0, total - got), done=done,
        )
    except Exception:
        pass


class ApiError(RuntimeError):
    """Raised when a request ultimately fails after retries/rotation."""


class NoKeyError(ApiError):
    """Raised when a provider has no configured key (caller should fall back)."""


@dataclass
class KeyPool:
    """A rotating pool of API keys for one provider.

    On a rate-limit/auth error the caller marks the current key limited (with a
    cooldown) and advances to the next *usable* key, so a run auto-switches to a
    fresh key instead of hammering the exhausted one. Cooldowns are per-key and
    time-boxed, so a key comes back into rotation once its window elapses.
    """

    keys: list[str] = field(default_factory=list)
    _idx: int = 0
    # per-key monotonic timestamp until which the key is considered rate-limited
    _cooldown_until: dict[int, float] = field(default_factory=dict)
    # consecutive 429s per key — drives escalating cooldowns (60s → 2m → … 30m),
    # because hourly quotas (e.g. Pexels 200/h) don't recover in one minute.
    _fails: dict[int, int] = field(default_factory=dict)

    def __bool__(self) -> bool:
        return bool(self.keys)

    def __len__(self) -> int:
        return len(self.keys)

    def current(self) -> str:
        if not self.keys:
            raise NoKeyError("no API key configured")
        return self.keys[self._idx % len(self.keys)]

    def mark_limited(self, seconds: Optional[float] = None) -> float:
        """Cool down the current key. Explicit ``seconds`` (a Retry-After header)
        is honoured; otherwise the cooldown ESCALATES with consecutive failures
        (60s, 2m, 4m … capped at 30m) so a quota-dead key stops burning retries."""
        if not self.keys:
            return 0.0
        idx = self._idx % len(self.keys)
        self._fails[idx] = self._fails.get(idx, 0) + 1
        cooldown = seconds if seconds is not None else min(1800.0, 60.0 * 2 ** (self._fails[idx] - 1))
        self._cooldown_until[idx] = time.monotonic() + cooldown
        return cooldown

    def mark_ok(self) -> None:
        """A request on the current key succeeded — reset its failure streak."""
        if self.keys:
            self._fails.pop(self._idx % len(self.keys), None)

    def advance(self) -> None:
        """Move to the next key not in cooldown; if all are cooled, to the one
        whose cooldown expires soonest (so a retry waits the least)."""
        if not self.keys:
            return
        now = time.monotonic()
        n = len(self.keys)
        for step in range(1, n + 1):
            idx = (self._idx + step) % n
            if self._cooldown_until.get(idx, 0.0) <= now:
                self._idx = idx
                return
        self._idx = min(range(n), key=lambda i: self._cooldown_until.get(i, 0.0))

    def cooldown_remaining(self) -> float:
        """Seconds until the current key is usable again (0 when ready now)."""
        if not self.keys:
            return 0.0
        idx = self._idx % len(self.keys)
        return max(0.0, self._cooldown_until.get(idx, 0.0) - time.monotonic())

    # backward-compat alias (old callers used rotate()) --------------------
    def rotate(self) -> None:
        self.advance()


class RateLimiter:
    """Minimal async rate limiter: at most ``rate`` calls per ``per`` seconds."""

    def __init__(self, rate: int = 4, per: float = 1.0) -> None:
        self._rate = rate
        self._per = per
        self._allowance = float(rate)
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            self._allowance += (now - self._last) * (self._rate / self._per)
            self._last = now
            if self._allowance > self._rate:
                self._allowance = float(self._rate)
            if self._allowance < 1.0:
                wait = (1.0 - self._allowance) * (self._per / self._rate)
                await asyncio.sleep(wait)
                self._allowance = 0.0
            else:
                self._allowance -= 1.0


class ApiManager:
    """Central async gateway for outbound HTTP + cache + retry + rotation."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._cache_dir: Path = self._settings.paths.cache / "api"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._client: Optional[httpx.AsyncClient] = None
        self._limiters: dict[str, RateLimiter] = {}
        self._max_retries = self._settings.max_retries
        # Ch20.14/20.16 — cap concurrent cloud calls to protect RAM + rate limits
        self._api_gate = asyncio.Semaphore(max(1, self._settings.max_parallel_api_calls))

    # ------------------------------------------------------------------ #
    # lifecycle
    # ------------------------------------------------------------------ #
    async def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._settings.request_timeout_sec,
                follow_redirects=True,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------ #
    # cache
    # ------------------------------------------------------------------ #
    def _cache_path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self._cache_dir / f"{digest}.json"

    def cache_get(self, key: str) -> Optional[Any]:
        if not self._settings.cache_enabled:      # 20.6 toggle
            return None
        path = self._cache_path(key)
        if path.exists():
            try:
                return json.loads(path.read_text("utf-8"))
            except Exception:
                return None
        return None

    def cache_set(self, key: str, value: Any) -> None:
        if not self._settings.cache_enabled:
            return
        try:
            self._cache_path(key).write_text(json.dumps(value), "utf-8")
        except Exception as exc:  # caching must never break the request
            log.debug("cache write failed: %s", exc)

    # Providers with documented caps get an exact host limiter. Known quotas
    # (the numbers every budget decision in this codebase is based on):
    #   Pexels    200 req/HOUR/key, 20k/month  → 7 keys ≈ 1400/h total
    #   Pixabay   100 req/MIN/key              → 8 keys, rarely binding
    #   OpenRouter free models ≈20 req/min, ~50-1000 req/DAY/key → 16 keys
    #   Groq free ≈30 req/min, ~14k/day (model-dependent) → 10 keys
    #   NVIDIA GLM 5.2: 38 req/min
    # Budget per run (150-scene video): ≤2 stock queries/beat ≈ 300 Pexels +
    # 300 Pixabay requests → ~4 full videos per hour inside Pexels quota.
    # Burst-firing burns whole key pools, so hosts are paced (cache absorbs
    # repeats); on 429 the request rotates keys, then WAITS minutes and retries.
    _HOST_RATES: dict[str, tuple[int, float]] = {
        "integrate.api.nvidia.com": (38, 60.0),  # GLM 5.2: 38 req/min
        "api.pexels.com": (1, 1.0),
        "pixabay.com": (1, 1.0),
        "openrouter.ai": (18, 60.0),   # stay under the 20/min free-tier rate
        "api.groq.com": (28, 60.0),    # stay under the ~30/min free tier
    }

    def _limiter(self, host: str) -> RateLimiter:
        if host not in self._limiters:
            rate, per = self._HOST_RATES.get(host, (4, 1.0))
            self._limiters[host] = RateLimiter(rate, per)
        return self._limiters[host]

    # ------------------------------------------------------------------ #
    # core request
    # ------------------------------------------------------------------ #
    async def request(
        self,
        method: str,
        url: str,
        *,
        pool: Optional[KeyPool] = None,
        key_in: str = "header",           # where the key goes: header | param | body
        auth_header: str = "Authorization",
        auth_prefix: str = "Bearer ",
        param_key_name: str = "key",      # query-param name when key_in="param"
        body_key_name: str = "api_key",   # json-body field when key_in="body"
        cache_key: Optional[str] = None,
        headers: Optional[dict[str, str]] = None,
        json_body: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
        expect_json: bool = True,
    ) -> Any:
        """Perform an HTTP request through cache → rate-limit → retry → rotate.

        Key rotation (Ch20.7): when a provider replies 429 (rate limit) or
        401/403 (bad/expired key) and a ``pool`` was supplied, the current key is
        cooled down and the request retries with the **next** key — cycling
        through every key in the pool before giving up. Works whether the key
        lives in an auth header (OpenRouter/Groq/Pexels), a query param (Pixabay)
        or the JSON body (Tavily).
        """
        if cache_key is not None:
            cached = self.cache_get(cache_key)
            if cached is not None:
                log.debug("cache hit %s", cache_key[:64])
                return cached

        host = httpx.URL(url).host or "default"
        client = await self.client()
        last_exc: Optional[Exception] = None

        # Rate-limit rotations get their own budget on top of transient retries,
        # so a big key pool is fully exhausted before we fall back (capped).
        n_keys = len(pool) if pool else 0
        max_attempts = min(15, self._max_retries + max(0, n_keys - 1))

        # When the WHOLE pool is rate-limited (every key cooling), don't give up:
        # wait out the cooldown (minutes, capped) and retry. Long waits have
        # their own budget so they never eat the normal retry attempts.
        attempt = 0
        long_waits = 0
        _MAX_LONG_WAITS = 3
        _LONG_WAIT_CAP = 300.0  # never sleep more than 5 min at once

        while attempt < max_attempts:
            await self._limiter(host).acquire()
            req_headers = dict(headers or {})
            req_params = dict(params or {})
            req_body = dict(json_body) if isinstance(json_body, dict) else json_body
            if pool is not None and pool:
                key = pool.current()
                if key_in == "param":
                    req_params[param_key_name] = key
                elif key_in == "body":
                    if not isinstance(req_body, dict):
                        req_body = {}
                    req_body[body_key_name] = key
                else:  # header
                    req_headers[auth_header] = f"{auth_prefix}{key}"
            t0 = time.monotonic()
            try:
                # 20.14/20.16 — never exceed the configured concurrent-call cap
                async with self._api_gate:
                    resp = await client.request(
                        method, url, headers=req_headers, json=req_body, params=req_params
                    )
                _record_api(host, (time.monotonic() - t0) * 1000, resp.status_code, url, method)
                if resp.status_code in (401, 403, 429) and pool is not None and pool:
                    # Cool the exhausted/bad key and switch to the next one.
                    # 429: honour Retry-After, else escalate per-key (hourly
                    # quotas don't recover in a minute). 401/403: bench 5 min.
                    header = _retry_after_header(resp)
                    cooldown = pool.mark_limited(
                        header if resp.status_code == 429 else (header or 300.0)
                    )
                    pool.advance()
                    remaining = pool.cooldown_remaining()
                    if remaining > 10.0 and long_waits < _MAX_LONG_WAITS:
                        # every key is cooling — wait minutes, then retry
                        wait = min(remaining, _LONG_WAIT_CAP)
                        long_waits += 1
                        _record_rate_limit(host, wait)
                        log.warning(
                            "all %d keys for %s rate-limited — waiting %.0fs then retrying (%d/%d)",
                            n_keys, host, wait, long_waits, _MAX_LONG_WAITS,
                        )
                        await asyncio.sleep(wait)
                        continue  # long waits do NOT consume the attempt budget
                    wait = min(remaining, _backoff(attempt))
                    log.warning(
                        "provider %s -> %s; auto-switching key (cooldown %.0fs, %d keys in pool)",
                        host, resp.status_code, cooldown, n_keys,
                    )
                    if wait > 0:
                        await asyncio.sleep(wait)
                    attempt += 1
                    continue
                if resp.status_code == 429 and (pool is None or not pool):
                    # rate limited with no key pool — wait a minute+ and retry
                    if long_waits < _MAX_LONG_WAITS:
                        wait = float(_retry_after_header(resp) or 60.0 * (long_waits + 1))
                        wait = min(wait, _LONG_WAIT_CAP)
                        long_waits += 1
                        _record_rate_limit(host, wait)
                        log.warning("%s rate-limited — waiting %.0fs then retrying (%d/%d)",
                                    host, wait, long_waits, _MAX_LONG_WAITS)
                        await asyncio.sleep(wait)
                        continue
                if resp.status_code >= 500:
                    await asyncio.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                if 400 <= resp.status_code < 500 and resp.status_code not in (401, 403, 429):
                    # permanent client error (404 unknown model, 400 bad request,
                    # 422…) — retrying can never help; fail fast, don't burn
                    # minutes on 15 futile attempts.
                    raise ApiError(
                        f"{host} returned {resp.status_code} (permanent): {resp.text[:160]}"
                    )
                resp.raise_for_status()
                if pool is not None and pool:
                    pool.mark_ok()  # healthy key — reset its 429 streak
                result = resp.json() if expect_json else resp.content
                if cache_key is not None and expect_json:
                    self.cache_set(cache_key, result)
                return result
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                _record_api(host, (time.monotonic() - t0) * 1000, 0, url, method, ok=False)
                log.debug("request attempt %d failed: %s", attempt, exc)
                await asyncio.sleep(_backoff(attempt))
                attempt += 1

        raise ApiError(f"request to {host} failed after {max_attempts} attempts: {last_exc}")

    async def download(self, url: str, dest: Path) -> Path:
        """Stream a binary asset to disk (cached by existence of ``dest``)."""
        if dest.exists() and dest.stat().st_size > 0:
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
        client = await self.client()
        tmp = dest.with_suffix(dest.suffix + ".part")
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length") or 0)
            got = 0
            t0 = time.monotonic()
            with tmp.open("wb") as fh:
                async for chunk in resp.aiter_bytes(1 << 16):
                    fh.write(chunk)
                    got += len(chunk)
                    _record_download(dest.name, got, total, time.monotonic() - t0)
        _record_download(dest.name, got, total, time.monotonic() - t0, done=True)
        tmp.replace(dest)
        return dest


def _backoff(attempt: int) -> float:
    """Exponential backoff with a small cap (Ch19.10)."""
    return min(8.0, 0.5 * (2 ** attempt))


def _retry_after_header(resp: "httpx.Response") -> Optional[float]:
    """The provider's ``Retry-After`` seconds, capped, or None when absent."""
    raw = resp.headers.get("retry-after")
    if raw:
        try:
            return max(0.0, min(1800.0, float(raw)))
        except ValueError:
            pass
    return None


# Process-wide singleton — agents share one manager (one cache, one client).
_manager: Optional[ApiManager] = None


def get_api_manager() -> ApiManager:
    global _manager
    if _manager is None:
        _manager = ApiManager()
    return _manager
