from __future__ import annotations

import json
import os
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import FastAPI, HTTPException, Query, Response, Request
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware

from .gee import get_terrain_tile_url
from graph_db.factory import build_default_osint_graph

from .schemas import AIChatContext, AIChatRequest, AIChatResponse, EdgeCreate, EdgeDelete, NodeCreate, NodeUpdate
from fastapi.responses import StreamingResponse

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).parent / ".env")
except ImportError:
    pass

app = FastAPI(
    title="Aegis Insight Graph API",
    version="0.1.0",
    description="OSINT-oriented graph API for investigations and link analysis.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _graph():
    return app.state.graph


@app.on_event("startup")
def load_seed_data() -> None:
    app.state.graph = build_default_osint_graph()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/graph")
def get_graph() -> dict:
    return _graph().to_dict()


@app.get("/graph/stats")
def get_stats() -> dict[str, int]:
    return _graph().stats()


@app.get("/map/gee/terrain")
def get_gee_terrain_layer() -> dict[str, str | bool]:
    tile_url = get_terrain_tile_url()
    if tile_url is None:
        return {
            "enabled": False,
            "reason": "Set GEE_SERVICE_ACCOUNT_EMAIL, GEE_PRIVATE_KEY, and GEE_PROJECT",
        }

    return {
        "enabled": True,
        "tile_url": tile_url,
        "attribution": "Google Earth Engine",
    }


@app.get("/graph/subgraph")
def get_subgraph(
    start_node_id: str = Query(..., min_length=1),
    depth: int = Query(2, ge=0, le=5),
) -> dict:
    graph = _graph()
    if graph.get_node(start_node_id) is None:
        raise HTTPException(status_code=404, detail="Start node not found")

    node_ids = set(graph.bfs(start_node_id=start_node_id, max_depth=depth))
    return graph.subgraph(node_ids)


@app.get("/nodes/search")
def search_nodes(key: str = Query(...), value: str = Query(...)) -> dict[str, list[dict]]:
    nodes = _graph().find_nodes_by_property(key, value)
    return {"nodes": [node.to_dict() for node in nodes]}


@app.get("/nodes/{node_id}")
def get_node(node_id: str) -> dict:
    node = _graph().get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node.to_dict()


@app.post("/nodes", status_code=201)
def create_node(payload: NodeCreate) -> dict:
    graph = _graph()
    try:
        node = graph.add_node(
            node_id=payload.node_id,
            node_type=payload.node_type,
            node_data=payload.node_data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return node.to_dict()


@app.patch("/nodes/{node_id}")
def patch_node(node_id: str, payload: NodeUpdate) -> dict:
    graph = _graph()
    try:
        node = graph.update_node_data(node_id=node_id, updates=payload.node_data)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return node.to_dict()


@app.delete("/nodes/{node_id}", status_code=204)
def delete_node(node_id: str) -> Response:
    _graph().remove_node(node_id)
    return Response(status_code=204)


@app.post("/edges", status_code=201)
def create_edge(payload: EdgeCreate) -> dict:
    graph = _graph()
    try:
        edge = graph.add_edge(
            source_id=payload.source_id,
            target_id=payload.target_id,
            edge_type=payload.edge_type,
            weight=payload.weight,
            edge_data=payload.edge_data,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return edge.to_dict()


@app.delete("/edges")
def delete_edge(payload: EdgeDelete) -> dict[str, int]:
    removed = _graph().remove_edge(
        source_id=payload.source_id,
        target_id=payload.target_id,
        edge_type=payload.edge_type,
    )
    return {"removed": removed}



# --- STREAMING OpenRouter API ---
import requests
import threading

def _openrouter_stream(payload: AIChatRequest):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        yield "data: {\"error\": \"OPENROUTER_API_KEY is not set. Configure it in the backend environment.\"}\n\n"
        return

    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    model = os.getenv("OPENROUTER_MODEL", "openrouter/cognitive-compute")

    context = payload.context
    context_text = _build_context_text(context)

    messages = [
        {
            "role": "system",
            "content": (
                "You are Aegis Insight AI assistant for analysts. "
                "Be context-aware based on current UI state and selected entity. "
                "Give concise, practical answers grounded in provided data. "
                "If context is missing, explicitly ask one focused follow-up question."
            ),
        },
        {"role": "system", "content": context_text},
    ]
    for message in payload.history[-12:]:
        messages.append({"role": message.role, "content": message.content})
    messages.append({"role": "user", "content": payload.message})

    request_body = {
        "model": model,
        "messages": messages,
        "temperature": 0.35,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aegis-insight.localhost/",  # OpenRouter requires Referer
        "X-Title": "Aegis Insight Chat"
    }

    try:
        with requests.post(f"{base_url}/chat/completions", json=request_body, headers=headers, stream=True, timeout=60) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if line:
                    yield line.decode("utf-8") + "\n"
    except requests.RequestException as exc:
        yield f"data: {{\"error\": \"{str(exc)[:400]}\"}}\n\n"


@app.post("/ai/chat")
async def ai_chat_stream(request: Request):
    payload = await request.json()
    chat_req = AIChatRequest(**payload)
    return StreamingResponse(_openrouter_stream(chat_req), media_type="text/event-stream")


def _build_context_text(context: AIChatContext) -> str:
    edge_lines: list[str] = []
    for edge in context.selected_node_edges[:10]:
        src = str(edge.get("source_id", "?"))
        dst = str(edge.get("target_id", "?"))
        edge_type = str(edge.get("edge_type", "related_to"))
        edge_lines.append(f"- {src} --{edge_type}--> {dst}")

    if not edge_lines:
        edge_lines.append("- No selected node edges in current context")

    return "\n".join(
        [
            "[UI CONTEXT]",
            f"Active section: {context.active_section}",
            f"Active view: {context.active_view}",
            f"Graph size: {context.graph_node_count} nodes, {context.graph_edge_count} edges",
            f"Selected node id: {context.selected_node_id or 'none'}",
            f"Selected node type: {context.selected_node_type or 'none'}",
            f"Selected node properties: {json.dumps(context.selected_node_data, ensure_ascii=True)}",
            "Selected node edges:",
            *edge_lines,
            "[/UI CONTEXT]",
        ]
    )
