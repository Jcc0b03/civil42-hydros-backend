from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Edge:
    source_id: str
    target_id: str
    edge_type: str = "related_to"
    weight: float = 1.0
    edge_data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "edge_type": self.edge_type,
            "weight": self.weight,
            "edge_data": dict(self.edge_data),
        }
