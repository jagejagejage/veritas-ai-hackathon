"""Tiny in-memory dataset store (LRU). Ephemeral by design: restart the server and it is empty."""
from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass

from .engine import Rows


@dataclass(frozen=True)
class Dataset:
    dataset_id: str
    rows: Rows
    opening_cents: int
    buffer_cents: int


class DatasetStore:
    def __init__(self, capacity: int = 200):
        self._cap = capacity
        self._items: OrderedDict[str, Dataset] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, rows: Rows, opening_cents: int, buffer_cents: int) -> Dataset:
        ds = Dataset(uuid.uuid4().hex[:12], rows, opening_cents, buffer_cents)
        with self._lock:
            self._items[ds.dataset_id] = ds
            while len(self._items) > self._cap:
                self._items.popitem(last=False)
        return ds

    def get(self, dataset_id: str) -> Dataset | None:
        with self._lock:
            ds = self._items.get(dataset_id)
            if ds:
                self._items.move_to_end(dataset_id)
            return ds


store = DatasetStore()
