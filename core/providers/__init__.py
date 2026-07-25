"""Provider layer — the only place the core talks to the outside world.

Per Ch20.7 no agent calls a cloud API directly; everything routes through the
:class:`~core.providers.api_manager.ApiManager` (retry, rate-limit, cache, key
rotation) and the typed provider clients built on top of it.
"""
