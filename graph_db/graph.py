from __future__ import annotations

from collections import defaultdict, deque
from threading import RLock
from typing import Any

from .edge import Edge
from .node import Node


class Graph:
    """Scalable in-memory graph database core.

    The implementation is optimized for frequent reads and neighborhood
    queries by keeping adjacency maps and property indexes in memory.
    """

    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.edges: dict[str, dict[str, list[Edge]]] = defaultdict(lambda: defaultdict(list))
        self._in_edges: dict[str, dict[str, list[Edge]]] = defaultdict(lambda: defaultdict(list))
        self._node_property_index: dict[str, dict[Any, set[str]]] = defaultdict(lambda: defaultdict(set))
        self._edge_count = 0
        self._lock = RLock()

    def add_node(
        self,
        node_id: str,
        node_type: str = "generic",
        node_data: dict[str, Any] | None = None,
    ) -> Node:
        with self._lock:
            if node_id in self.nodes:
                raise ValueError(f"Node '{node_id}' already exists")

            node = Node(node_id=node_id, node_type=node_type, node_data=node_data or {})
            self.nodes[node_id] = node
            self._index_node(node)
            return node

    def upsert_node(
        self,
        node_id: str,
        node_type: str = "generic",
        node_data: dict[str, Any] | None = None,
    ) -> Node:
        with self._lock:
            existing = self.nodes.get(node_id)
            if existing is None:
                return self.add_node(node_id, node_type=node_type, node_data=node_data)

            self._deindex_node(existing)
            existing.node_type = node_type
            if node_data is not None:
                existing.node_data = dict(node_data)
            self._index_node(existing)
            return existing

    def get_node(self, node_id: str) -> Node | None:
        return self.nodes.get(node_id)

    def update_node_data(self, node_id: str, updates: dict[str, Any]) -> Node:
        with self._lock:
            node = self.nodes.get(node_id)
            if node is None:
                raise KeyError(f"Node '{node_id}' does not exist")

            self._deindex_node(node)
            node.update_data(updates)
            self._index_node(node)
            return node

    def remove_node(self, node_id: str) -> None:
        with self._lock:
            node = self.nodes.pop(node_id, None)
            if node is None:
                return

            self._deindex_node(node)

            # Remove outgoing edges.
            out_targets = list(self.edges[node_id].keys())
            for target_id in out_targets:
                removed_edges = self.edges[node_id].pop(target_id)
                self._edge_count -= len(removed_edges)
                self._in_edges[target_id].pop(node_id, None)

            self.edges.pop(node_id, None)

            # Remove incoming edges.
            in_sources = list(self._in_edges[node_id].keys())
            for source_id in in_sources:
                removed_edges = self._in_edges[node_id].pop(source_id)
                self._edge_count -= len(removed_edges)
                self.edges[source_id].pop(node_id, None)

            self._in_edges.pop(node_id, None)

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str = "related_to",
        weight: float = 1.0,
        edge_data: dict[str, Any] | None = None,
        create_missing_nodes: bool = False,
    ) -> Edge:
        with self._lock:
            if create_missing_nodes:
                if source_id not in self.nodes:
                    self.add_node(source_id)
                if target_id not in self.nodes:
                    self.add_node(target_id)

            if source_id not in self.nodes or target_id not in self.nodes:
                raise KeyError("Both source and target nodes must exist")

            edge = Edge(
                source_id=source_id,
                target_id=target_id,
                edge_type=edge_type,
                weight=weight,
                edge_data=edge_data or {},
            )
            self.edges[source_id][target_id].append(edge)
            self._in_edges[target_id][source_id].append(edge)
            self._edge_count += 1
            return edge

    def remove_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str | None = None,
    ) -> int:
        with self._lock:
            edge_list = self.edges.get(source_id, {}).get(target_id)
            if not edge_list:
                return 0

            if edge_type is None:
                removed = len(edge_list)
                self.edges[source_id].pop(target_id, None)
                self._in_edges[target_id].pop(source_id, None)
            else:
                kept = [edge for edge in edge_list if edge.edge_type != edge_type]
                removed = len(edge_list) - len(kept)
                if kept:
                    self.edges[source_id][target_id] = kept
                    self._in_edges[target_id][source_id] = kept
                else:
                    self.edges[source_id].pop(target_id, None)
                    self._in_edges[target_id].pop(source_id, None)

            self._edge_count -= removed
            return removed

    def neighbors(
        self,
        node_id: str,
        direction: str = "out",
        edge_type: str | None = None,
    ) -> list[Node]:
        if direction not in {"out", "in"}:
            raise ValueError("direction must be either 'out' or 'in'")

        if direction == "out":
            adjacency = self.edges.get(node_id, {})
        else:
            adjacency = self._in_edges.get(node_id, {})

        result_ids: set[str] = set()
        for neighbor_id, edge_list in adjacency.items():
            if edge_type is None or any(edge.edge_type == edge_type for edge in edge_list):
                result_ids.add(neighbor_id)

        return [self.nodes[nid] for nid in result_ids if nid in self.nodes]

    def find_nodes_by_property(self, key: str, value: Any) -> list[Node]:
        node_ids = self._node_property_index.get(key, {}).get(value, set())
        return [self.nodes[node_id] for node_id in node_ids]

    def bfs(
        self,
        start_node_id: str,
        max_depth: int | None = None,
        edge_type: str | None = None,
        direction: str = "out",
    ) -> list[str]:
        if start_node_id not in self.nodes:
            return []

        if direction not in {"out", "in"}:
            raise ValueError("direction must be either 'out' or 'in'")

        visited = {start_node_id}
        queue = deque([(start_node_id, 0)])
        order: list[str] = []

        while queue:
            current, depth = queue.popleft()
            order.append(current)

            if max_depth is not None and depth >= max_depth:
                continue

            adjacent = self.edges.get(current, {}) if direction == "out" else self._in_edges.get(current, {})
            for neighbor_id, edge_list in adjacent.items():
                if edge_type is not None and not any(edge.edge_type == edge_type for edge in edge_list):
                    continue
                if neighbor_id in visited:
                    continue
                visited.add(neighbor_id)
                queue.append((neighbor_id, depth + 1))

        return order

    def shortest_path(
        self,
        source_id: str,
        target_id: str,
        edge_type: str | None = None,
    ) -> list[str]:
        if source_id not in self.nodes or target_id not in self.nodes:
            return []

        if source_id == target_id:
            return [source_id]

        queue = deque([source_id])
        parent: dict[str, str | None] = {source_id: None}

        while queue:
            current = queue.popleft()
            for neighbor_id, edge_list in self.edges.get(current, {}).items():
                if edge_type is not None and not any(edge.edge_type == edge_type for edge in edge_list):
                    continue
                if neighbor_id in parent:
                    continue

                parent[neighbor_id] = current
                if neighbor_id == target_id:
                    return self._rebuild_path(parent, target_id)
                queue.append(neighbor_id)

        return []

    def stats(self) -> dict[str, int]:
        return {
            "nodes": len(self.nodes),
            "edges": self._edge_count,
        }

    def list_edges(self) -> list[Edge]:
        return [
            edge
            for source_edges in self.edges.values()
            for target_edges in source_edges.values()
            for edge in target_edges
        ]

    def subgraph(self, node_ids: set[str]) -> dict[str, Any]:
        filtered_nodes = [self.nodes[node_id].to_dict() for node_id in node_ids if node_id in self.nodes]
        filtered_edges = [
            edge.to_dict()
            for edge in self.list_edges()
            if edge.source_id in node_ids and edge.target_id in node_ids
        ]
        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": [node.to_dict() for node in self.nodes.values()],
            "edges": [edge.to_dict() for edge in self.list_edges()],
        }

    @staticmethod
    def _rebuild_path(parent: dict[str, str | None], target_id: str) -> list[str]:
        path = [target_id]
        cursor = target_id
        while parent[cursor] is not None:
            cursor = parent[cursor]  # type: ignore[index]
            path.append(cursor)
        path.reverse()
        return path

    def _index_node(self, node: Node) -> None:
        for key, value in node.node_data.items():
            if value is None:
                continue
            self._node_property_index[key][value].add(node.node_id)

    def _deindex_node(self, node: Node) -> None:
        for key, value in node.node_data.items():
            if value is None:
                continue
            indexed_nodes = self._node_property_index.get(key, {}).get(value)
            if not indexed_nodes:
                continue
            indexed_nodes.discard(node.node_id)
            if not indexed_nodes:
                self._node_property_index[key].pop(value, None)
            if not self._node_property_index[key]:
                self._node_property_index.pop(key, None)
