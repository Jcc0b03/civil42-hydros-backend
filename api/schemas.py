from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class NodeCreate(BaseModel):
    node_id: str = Field(min_length=1)
    node_type: str = "generic"
    node_data: dict[str, Any] = Field(default_factory=dict)


class NodeUpdate(BaseModel):
    node_data: dict[str, Any] = Field(default_factory=dict)


class EdgeCreate(BaseModel):
    source_id: str = Field(min_length=1)
    target_id: str = Field(min_length=1)
    edge_type: str = "related_to"
    weight: float = 1.0
    edge_data: dict[str, Any] = Field(default_factory=dict)


class EdgeDelete(BaseModel):
    source_id: str
    target_id: str
    edge_type: str | None = None


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class AIChatContext(BaseModel):
    active_section: str = "current-view"
    active_view: str = "graph"
    selected_node_id: str | None = None
    graph_node_count: int = 0
    graph_edge_count: int = 0
    selected_node_type: str | None = None
    selected_node_data: dict[str, Any] = Field(default_factory=dict)
    selected_node_edges: list[dict[str, Any]] = Field(default_factory=list)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1)
    context: AIChatContext
    history: list[AIChatMessage] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    reply: str
