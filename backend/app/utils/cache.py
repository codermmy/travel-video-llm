"""In-memory cache utilities.

This module provides a small thread-safe cache used for AI and geocoding.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from threading import Lock
from typing import Generic, Optional, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class CacheEntry(Generic[T]):
    value: T
    expires_at: float


class SimpleCache(Generic[T]):
    def __init__(self) -> None:
        self._lock = Lock()
        self._store: dict[str, CacheEntry[T]] = {}

    def get(self, key: str) -> Optional[T]:
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._store.pop(key, None)
                return None
            return entry.value

    def set(self, key: str, value: T, ttl: int = 3600) -> None:
        expires_at = time.time() + max(0, int(ttl))
        with self._lock:
            self._store[key] = CacheEntry(value=value, expires_at=expires_at)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


# Specialized caches
geocoding_cache: SimpleCache[str] = SimpleCache()
_ai_cache: SimpleCache[object] = SimpleCache()


def simple_cache(key: str, value: Optional[object] = None, ttl: int = 86400) -> object | None:
    """Backward-compatible cache used by AIService."""

    if value is None:
        return _ai_cache.get(key)

    _ai_cache.set(key, value, ttl=ttl)
    return value
