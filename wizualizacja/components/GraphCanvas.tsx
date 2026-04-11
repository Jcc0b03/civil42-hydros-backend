"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

export type GraphNode = {
  node_id: string;
  node_type: string;
  node_data: Record<string, unknown>;
};

export type GraphEdge = {
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
  edge_data: Record<string, unknown>;
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
};

type PositionedNode = GraphNode & {
  x: number;
  y: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type PanState = {
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
};

const NODE_COLORS: Record<string, string> = {
  person: "#1f6feb",
  organization: "#2f855a",
  domain: "#b45309",
  ip_address: "#6b46c1",
  crypto_wallet: "#be123c",
  generic: "#334155",
};

export default function GraphCanvas({ nodes, edges, selectedNodeId, onNodeSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setPositions(buildInitialPositions(nodes));
    setDragState(null);
  }, [nodes]);

  const { positionedNodes, edgeLines } = useMemo(() => {
    const byId = new Map<string, PositionedNode>();
    nodes.forEach((node) => {
      const point = positions[node.node_id];
      if (!point) {
        return;
      }
      byId.set(node.node_id, { ...node, x: point.x, y: point.y });
    });

    const lines = edges
      .map((edge) => {
        const from = byId.get(edge.source_id);
        const to = byId.get(edge.target_id);
        if (!from || !to) {
          return null;
        }
        return {
          id: `${edge.source_id}-${edge.target_id}-${edge.edge_type}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          label: edge.edge_type,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    return {
      positionedNodes: [...byId.values()],
      edgeLines: lines,
    };
  }, [nodes, edges, positions]);

  function pointerToSvg(event: PointerEvent<SVGElement>): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return null;
    }
    const result = point.matrixTransform(ctm.inverse());
    return {
      x: result.x,
      y: result.y,
    };
  }

  function pointerToGraph(event: PointerEvent<SVGElement>): { x: number; y: number } | null {
    const point = pointerToSvg(event);
    if (!point) {
      return null;
    }

    return {
      x: (point.x - viewOffset.x) / viewScale,
      y: (point.y - viewOffset.y) / viewScale,
    };
  }

  function onNodePointerDown(event: PointerEvent<SVGGElement>, nodeId: string): void {
    const currentPoint = pointerToGraph(event);
    const currentNode = positions[nodeId];
    if (!currentPoint || !currentNode) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      nodeId,
      offsetX: currentPoint.x - currentNode.x,
      offsetY: currentPoint.y - currentNode.y,
      startX: currentPoint.x,
      startY: currentPoint.y,
      moved: false,
    });
  }

  function onCanvasPointerDown(event: PointerEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    const point = pointerToSvg(event);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setPanState({
      startX: point.x,
      startY: point.y,
      initialX: viewOffset.x,
      initialY: viewOffset.y,
    });
  }

  function onCanvasWheel(event: React.WheelEvent<SVGSVGElement>): void {
    if (event.cancelable) {
      event.preventDefault();
    }
    const svgPoint = pointerToSvg(event as unknown as PointerEvent<SVGElement>);
    if (!svgPoint) {
      return;
    }

    const intensity = 0.00135;
    const nextScale = clamp(viewScale * Math.exp(-event.deltaY * intensity), 0.45, 2.8);
    const worldX = (svgPoint.x - viewOffset.x) / viewScale;
    const worldY = (svgPoint.y - viewOffset.y) / viewScale;

    setViewScale(nextScale);
    setViewOffset({
      x: svgPoint.x - worldX * nextScale,
      y: svgPoint.y - worldY * nextScale,
    });
  }

  function onSvgPointerMove(event: PointerEvent<SVGSVGElement>): void {
    if (panState && !dragState) {
      const point = pointerToSvg(event);
      if (!point) {
        return;
      }

      setViewOffset({
        x: panState.initialX + (point.x - panState.startX),
        y: panState.initialY + (point.y - panState.startY),
      });
      return;
    }

    if (!dragState) {
      return;
    }
    const currentPoint = pointerToGraph(event);
    if (!currentPoint) {
      return;
    }

    const nextX = Math.max(36, Math.min(924, currentPoint.x - dragState.offsetX));
    const nextY = Math.max(36, Math.min(524, currentPoint.y - dragState.offsetY));

    const movedDistance = Math.hypot(currentPoint.x - dragState.startX, currentPoint.y - dragState.startY);
    setPositions((prev) => ({
      ...prev,
      [dragState.nodeId]: { x: nextX, y: nextY },
    }));
    if (!dragState.moved && movedDistance > 4) {
      setDragState((prev) => (prev ? { ...prev, moved: true } : prev));
    }
  }

  function onSvgPointerUp(): void {
    if (dragState && !dragState.moved) {
      onNodeSelect(dragState.nodeId);
    }
    setDragState(null);
    setPanState(null);
  }

  function zoomBy(factor: number): void {
    const nextScale = clamp(viewScale * factor, 0.45, 2.8);
    const centerX = 480;
    const centerY = 280;
    const worldX = (centerX - viewOffset.x) / viewScale;
    const worldY = (centerY - viewOffset.y) / viewScale;

    setViewScale(nextScale);
    setViewOffset({
      x: centerX - worldX * nextScale,
      y: centerY - worldY * nextScale,
    });
  }

  function resetView(): void {
    setViewScale(1);
    setViewOffset({ x: 0, y: 0 });
  }

  return (
    <div className="graph-shell">
      <div className="graph-toolbar" role="toolbar" aria-label="Kontrola widoku grafu">
        <button type="button" className="graph-tool-btn" onClick={() => zoomBy(1.16)}>
          +
        </button>
        <button type="button" className="graph-tool-btn" onClick={() => zoomBy(1 / 1.16)}>
          -
        </button>
        <button type="button" className="graph-tool-btn graph-tool-btn-reset" onClick={resetView}>
          Reset
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 960 560"
        role="img"
        aria-label="Wizualizacja grafu OSINT"
        className="graph-svg"
        onPointerDown={onCanvasPointerDown}
        onWheel={onCanvasWheel}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L7,3 z" fill="#7b8aa0" />
          </marker>
        </defs>

        <g transform={`translate(${viewOffset.x} ${viewOffset.y}) scale(${viewScale})`}>
          {edgeLines.map((edge) => (
            <g key={edge.id}>
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="#7b8aa0"
                strokeWidth="1.8"
                markerEnd="url(#arrow)"
                opacity="0.85"
              />
              <text x={(edge.x1 + edge.x2) / 2} y={(edge.y1 + edge.y2) / 2 - 6} className="edge-label">
                {edge.label}
              </text>
            </g>
          ))}

          {positionedNodes.map((node) => (
            <g
              key={node.node_id}
              onPointerDown={(event) => onNodePointerDown(event, node.node_id)}
              className={`node-group${selectedNodeId === node.node_id ? " is-selected" : ""}`}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="26"
                fill={NODE_COLORS[node.node_type] ?? NODE_COLORS.generic}
                stroke="#f8fafc"
                strokeWidth="2"
              />
              <text x={node.x} y={node.y + 4} textAnchor="middle" className="node-type">
                {node.node_type.slice(0, 3).toUpperCase()}
              </text>
              <text x={node.x} y={node.y + 42} textAnchor="middle" className="node-id">
                {node.node_id}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function buildInitialPositions(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const width = 960;
  const height = 560;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(180, Math.min(250, 90 + nodes.length * 8));

  const nextPositions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
    nextPositions[node.node_id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
  return nextPositions;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
