from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Node:
    node_id: str
    node_type: str = "generic"
    node_data: dict[str, Any] = field(default_factory=dict)

    def update_data(self, updates: dict[str, Any]) -> None:
        self.node_data.update(updates)

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "node_data": dict(self.node_data),
        }
