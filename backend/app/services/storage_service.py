from __future__ import annotations

from abc import ABC, abstractmethod


class StorageService(ABC):
    @abstractmethod
    def save(self, *, key: str, content: bytes) -> str:
        raise NotImplementedError
