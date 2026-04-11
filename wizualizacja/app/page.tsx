"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { GraphEdge, GraphNode } from "@/components/GraphCanvas";
import type { CameraFeed } from "@/components/MapCanvas";

const MapCanvas = dynamic(() => import("../components/MapCanvas"), {
  ssr: false,
});

type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SidebarSection = "current-view" | "social-intelligence" | "attack-suite" | "agents-manager" | "settings";

type NodeSortColumn = "node_id" | "node_type" | "country" | "risk_level";
type SortDirection = "asc" | "desc";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const CAMERA_FEED_SRC = process.env.NEXT_PUBLIC_CAMERA_FEED_SRC ?? "";
const CAMERA_FEED_PAGE_URL = process.env.NEXT_PUBLIC_CAMERA_FEED_PAGE_URL ?? "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/";

export default function HomePage() {
  const [graph, setGraph] = useState<GraphResponse>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<CameraFeed | null>(null);
  const [activeView] = useState<"map">("map");
  const [activeSection, setActiveSection] = useState<SidebarSection>("current-view");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [cameraEmbedStatus, setCameraEmbedStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cameraPanelPos, setCameraPanelPos] = useState({ x: 12, y: 12 });
  const [cameraPanelDrag, setCameraPanelDrag] = useState<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "AI panel aktywny. Mozesz zadac pytanie o aktualny graf lub wybrany node.",
    },
  ]);
  const [nodeDetailPos, setNodeDetailPos] = useState({ x: 10, y: 10 });
  const [nodeDetailDrag, setNodeDetailDrag] = useState<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const cameraEmbedRef = useRef<HTMLDivElement | null>(null);
  const cameraPanelRef = useRef<HTMLElement | null>(null);
  const graphPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = graph.nodes.find((node) => node.node_id === selectedNodeId) ?? null;
  const selectedNodeEdges = selectedNode
    ? graph.edges.filter((edge) => edge.source_id === selectedNode.node_id || edge.target_id === selectedNode.node_id)
    : [];

  useEffect(() => {
    if (!selectedCamera || CAMERA_FEED_SRC.trim().length > 0) {
      setCameraEmbedStatus("idle");
      return;
    }

    const host = cameraEmbedRef.current;
    if (!host) {
      return;
    }

    setCameraEmbedStatus("loading");
    host.innerHTML = "";

    const script = document.createElement("script");
    script.className = "video-player-nadaje-com";
    script.setAttribute("data-player-id", selectedCamera.playerId);
    script.setAttribute("data-autoplay", "true");
    script.setAttribute("data-muted", "true");
    script.src = "https://player.nadaje.com/video/1.0/embed.min.js";
    script.async = true;

    let cancelled = false;

    script.onerror = () => {
      if (!cancelled) {
        setCameraEmbedStatus("error");
      }
    };

    host.appendChild(script);

    const forceAutoplay = () => {
      const media = host.querySelector("video") as HTMLVideoElement | null;
      if (!media) {
        return false;
      }

      media.muted = true;
      media.autoplay = true;
      media.playsInline = true;
      void media.play().catch(() => {
        // Browser policy can still block autoplay in some contexts.
      });
      return true;
    };

    const observer = new MutationObserver(() => {
      if (forceAutoplay()) {
        observer.disconnect();
      }
    });

    observer.observe(host, { childList: true, subtree: true });
    forceAutoplay();

    const readyCheck = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      const playerNode = host.querySelector(".video-js, video, iframe");
      setCameraEmbedStatus(playerNode ? "ready" : "error");
    }, 2400);

    return () => {
      cancelled = true;
      window.clearTimeout(readyCheck);
      observer.disconnect();
      host.innerHTML = "";
    };
  }, [selectedCamera]);

  useEffect(() => {
    void fetchFullGraph();
  }, []);

  useEffect(() => {
    if (activeSection !== "current-view" || activeView !== "map") {
      setSelectedCamera(null);
      setCameraPanelDrag(null);
    }
  }, [activeSection, activeView]);

  function onCameraHeaderMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startY = event.clientY;
    setCameraPanelDrag({
      startX,
      startY,
      offsetX: cameraPanelPos.x,
      offsetY: cameraPanelPos.y,
    });
  }

  useEffect(() => {
    if (!cameraPanelDrag) {
      return;
    }

    const dragState = cameraPanelDrag;

    function onMouseMove(event: MouseEvent) {
      const containerRect = graphPanelRef.current?.getBoundingClientRect();
      const panelRect = cameraPanelRef.current?.getBoundingClientRect();

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      let nextX = dragState.offsetX + deltaX;
      let nextY = dragState.offsetY + deltaY;

      if (containerRect && panelRect) {
        const maxX = Math.max(0, containerRect.width - panelRect.width);
        const maxY = Math.max(0, containerRect.height - panelRect.height);
        nextX = Math.max(0, Math.min(maxX, nextX));
        nextY = Math.max(0, Math.min(maxY, nextY));
      }

      setCameraPanelPos({ x: nextX, y: nextY });
    }

    function onMouseUp() {
      setCameraPanelDrag(null);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [cameraPanelDrag]);

  async function fetchFullGraph() {
    try {
      const response = await fetch(`${API_URL}/graph`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Nie udało się pobrać grafu");
      }
      const data = (await response.json()) as GraphResponse;
      setGraph(data);
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Nieznany blad");
    }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const history = chatMessages.slice(-12);
    const contextPayload = {
      active_section: activeSection,
      active_view: activeView,
      selected_node_id: selectedNode?.node_id ?? null,
      graph_node_count: graph.nodes.length,
      graph_edge_count: graph.edges.length,
      selected_node_type: selectedNode?.node_type ?? null,
      selected_node_data: selectedNode?.node_data ?? {},
      selected_node_edges: selectedNodeEdges.map((edge) => ({
        source_id: edge.source_id,
        target_id: edge.target_id,
        edge_type: edge.edge_type,
        weight: edge.weight,
      })),
    };

    setChatMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatLoading(true);

    try {
      // Do backendu nie wysyłaj pustej wiadomości asystenta!
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          context: contextPayload,
          history, // tylko user/assistant z treścią, bez pustych
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || "AI request failed");
      }

      const reader = response.body.getReader();
      let aiMessage = "";
      let done = false;
      let decoder = new TextDecoder("utf-8");
      let errorFromStream = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // OpenRouter returns lines like: data: {"choices":[{"delta":{"content":"..."}}]}
          for (const line of chunk.split("\n")) {
            if (!line.trim()) continue;
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  errorFromStream = data.error;
                }
                if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                  aiMessage += data.choices[0].delta.content;
                  setChatMessages((prev) => {
                    // Update the last assistant message
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: aiMessage };
                    return updated;
                  });
                }
              } catch (e) {
                // ignore parse errors
              }
            }
          }
        }
      }
      if (errorFromStream) {
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Nie udalo sie uzyskac odpowiedzi AI. Szczegoly: ${errorFromStream}`,
          };
          return updated;
        });
      } else if (!aiMessage) {
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Brak odpowiedzi z modelu.",
          };
          return updated;
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nieznany blad AI";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Nie udalo sie uzyskac odpowiedzi AI. Sprawdz konfiguracje backendu (OPENROUTER_API_KEY) i sproboj ponownie.\n\nSzczegoly: " +
            errorMessage,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function onNodeDetailHeaderMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startY = event.clientY;
    setNodeDetailDrag({
      startX,
      startY,
      offsetX: nodeDetailPos.x,
      offsetY: nodeDetailPos.y,
    });
  }

  function renderPropertyValue(key: string, value: unknown) {
    const keyLower = key.toLowerCase();
    const isRiskProperty = keyLower.includes("risk");

    if (isRiskProperty) {
      const normalizedValue = String(value).trim().toLowerCase();
      const riskMap: Record<string, number> = {
        low: 1,
        medium: 2,
        high: 3,
        niski: 1,
        sredni: 2,
        średni: 2,
        wysoki: 3,
      };
      const mappedLevel = riskMap[normalizedValue];
      const numericLevel = Number(value);
      const level = Number.isFinite(mappedLevel)
        ? mappedLevel
        : Number.isFinite(numericLevel)
          ? Math.max(1, Math.min(3, Math.round(numericLevel)))
          : 1;

      return (
        <div className="risk-scale">
          <span className={`risk-badge risk-level-${level}`}>{["Niski", "Średni", "Wysoki"][level - 1]}</span>
          <div className="risk-bars">
            {[1, 2, 3].map((barLevel) => (
              <div
                key={barLevel}
                className={`risk-bar${barLevel <= level ? " is-active" : ""}`}
                data-level={barLevel}
              />
            ))}
          </div>
        </div>
      );
    }

    return <span className="prop-value">{String(value)}</span>;
  }

  useEffect(() => {
    if (!nodeDetailDrag) {
      return;
    }

    const dragState = nodeDetailDrag;

    function onMouseMove(event: MouseEvent) {
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      setNodeDetailPos({
        x: dragState.offsetX + deltaX,
        y: dragState.offsetY + deltaY,
      });
    }

    function onMouseUp() {
      setNodeDetailDrag(null);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [nodeDetailDrag]);

  function openChatPanel() {
    setSelectedNodeId(null);
    setChatOpen(true);
  }

  const sectionTitles: Record<SidebarSection, string> = {
    "current-view": "Current View",
    "social-intelligence": "Social Intelligence",
    "attack-suite": "Attack Suite",
    "agents-manager": "Agents Manager",
    settings: "Settings",
  };

  const sectionDescriptions: Record<Exclude<SidebarSection, "current-view">, string> = {
    "social-intelligence":
      "Modul do pracy na osobach, organizacjach i relacjach miedzy profilami, kampaniami oraz zrodlami.",
    "attack-suite":
      "Panel operacyjny do orkiestracji scenariuszy testowych, runbookow oraz automatyzacji analizy technicznej.",
    "agents-manager":
      "Miejsce do konfiguracji i monitorowania agentow AI wykorzystywanych podczas dochodzen i analizy sygnalow.",
    settings:
      "Centralna konfiguracja endpointow, warstw danych, poziomow ryzyka oraz preferencji interfejsu operatora.",
  };

  const sectionCompactLabels: Record<SidebarSection, string> = {
    "current-view": "CV",
    "social-intelligence": "SI",
    "attack-suite": "AS",
    "agents-manager": "AM",
    settings: "ST",
  };

  function renderMenuIcon(section: SidebarSection) {
    if (section === "current-view") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-item-icon">
          <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h3v3H8V8zm5 0h3v3h-3V8zm-5 5h3v3H8v-3zm5 0h3v3h-3v-3z" />
        </svg>
      );
    }

    if (section === "social-intelligence") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-item-icon">
          <path d="M12 3a4 4 0 110 8 4 4 0 010-8zM5 8a3 3 0 110 6 3 3 0 010-6zm14 0a3 3 0 110 6 3 3 0 010-6zM12 13c3.6 0 6.5 1.9 6.5 4.2V20H5.5v-2.8C5.5 14.9 8.4 13 12 13zm-7 2c1.2 0 2.2.2 3 .6-.9.7-1.5 1.6-1.7 2.7H2.5V17c0-1.1 1.2-2 2.5-2zm14 0c1.3 0 2.5.9 2.5 2v1.3h-3.8c-.2-1.1-.8-2-1.7-2.7.8-.4 1.8-.6 3-.6z" />
        </svg>
      );
    }

    if (section === "attack-suite") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-item-icon">
          <path d="M13 2l1.3 2.9L17 6l-2.1 2.2.4 3-2.3-1.3L10.7 11l.4-3L9 6l2.7-1.1L13 2zm-7 9h4l1 2h7v2h-1v5H7v-5H6v-2zm2 4v3h7v-3H8zm10-8h3v3h-3V7zm0 4h3v3h-3v-3z" />
        </svg>
      );
    }

    if (section === "agents-manager") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-item-icon">
          <path d="M9 2h6v2h2a2 2 0 012 2v5h-2V6h-2v2H9V6H7v5H5V6a2 2 0 012-2h2V2zm1 2v2h4V4h-4zm-3 9h10a4 4 0 014 4v3H3v-3a4 4 0 014-4zm0 2a2 2 0 00-2 2v1h14v-1a2 2 0 00-2-2H7zm5-5a3 3 0 110 6 3 3 0 010-6z" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-item-icon">
        <path d="M12 2l2 2.2 3-.2.8 2.9 2.7 1.3-1.3 2.7 1.3 2.7-2.7 1.3-.8 2.9-3-.2L12 22l-2-2.2-3 .2-.8-2.9-2.7-1.3 1.3-2.7-1.3-2.7 2.7-1.3.8-2.9 3 .2L12 2zm0 6a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
    );
  }

  return (
    <main className={`workspace${mobileSidebarOpen ? " mobile-sidebar-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-mobile-controls">
          <button type="button" className="sidebar-mobile-close" onClick={() => setMobileSidebarOpen(false)}>
            Zamknij
          </button>
        </div>
        <section className="sidebar-menu">
          <button
            type="button"
            className={`menu-item${activeSection === "current-view" ? " is-active" : ""}`}
            onClick={() => setActiveSection("current-view")}
            title="Current View"
            aria-label="Current View"
            data-tooltip="Current View"
          >
            {renderMenuIcon("current-view")}
            <span className="menu-item-abbr">{sectionCompactLabels["current-view"]}</span>
            <span className="menu-item-text">Current View</span>
          </button>
          <button
            type="button"
            className={`menu-item${activeSection === "social-intelligence" ? " is-active" : ""}`}
            onClick={() => setActiveSection("social-intelligence")}
            title="Social Intelligence"
            aria-label="Social Intelligence"
            data-tooltip="Social Intelligence"
          >
            {renderMenuIcon("social-intelligence")}
            <span className="menu-item-abbr">{sectionCompactLabels["social-intelligence"]}</span>
            <span className="menu-item-text">Social Intelligence</span>
          </button>
          <button
            type="button"
            className={`menu-item${activeSection === "attack-suite" ? " is-active" : ""}`}
            onClick={() => setActiveSection("attack-suite")}
            title="Attack Suite"
            aria-label="Attack Suite"
            data-tooltip="Attack Suite"
          >
            {renderMenuIcon("attack-suite")}
            <span className="menu-item-abbr">{sectionCompactLabels["attack-suite"]}</span>
            <span className="menu-item-text">Attack Suite</span>
          </button>
          <button
            type="button"
            className={`menu-item${activeSection === "agents-manager" ? " is-active" : ""}`}
            onClick={() => setActiveSection("agents-manager")}
            title="Agents Manager"
            aria-label="Agents Manager"
            data-tooltip="Agents Manager"
          >
            {renderMenuIcon("agents-manager")}
            <span className="menu-item-abbr">{sectionCompactLabels["agents-manager"]}</span>
            <span className="menu-item-text">Agents Manager</span>
          </button>
          <button
            type="button"
            className={`menu-item${activeSection === "settings" ? " is-active" : ""}`}
            onClick={() => setActiveSection("settings")}
            title="Settings"
            aria-label="Settings"
            data-tooltip="Settings"
          >
            {renderMenuIcon("settings")}
            <span className="menu-item-abbr">{sectionCompactLabels.settings}</span>
            <span className="menu-item-text">Settings</span>
          </button>
        </section>
      </aside>

      <section className="graph-area">
        <div className="graph-header">
          <h2>{sectionTitles[activeSection]}</h2>
          {activeSection === "current-view" ? (
            <div className="graph-header-spacer" />
          ) : (
            <div className="graph-header-spacer" />
          )}
          <button
            type="button"
            className="chat-fab"
            onClick={openChatPanel}
            aria-label="Otworz AI Chat"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-fab-icon">
              <path d="M4 5h16v10H8l-4 4V5z" />
            </svg>
            <span>AI</span>
          </button>
        </div>
        <div className="graph-panel" ref={graphPanelRef}>
          <div className="mobile-top-controls" aria-label="Sterowanie górne">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Otworz panel boczny"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-menu-icon">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            </button>
            <button type="button" className="chat-fab mobile-chat-fab" onClick={openChatPanel} aria-label="Otworz AI Chat">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="chat-fab-icon">
                <path d="M4 5h16v10H8l-4 4V5z" />
              </svg>
              <span>AI</span>
            </button>
          </div>
          
          {activeSection === "current-view" ? (
            <>
              <MapCanvas
                nodes={[]}
                edges={[]}
                selectedNodeId={selectedNodeId}
                onNodeSelect={setSelectedNodeId}
                onCameraSelect={setSelectedCamera}
                apiUrl={API_URL}
              />

              {selectedCamera ? (
                <section
                  ref={cameraPanelRef}
                  className="camera-feed-panel"
                  aria-label="Podglad kamerki online"
                  style={{
                    transform: `translate(${cameraPanelPos.x}px, ${cameraPanelPos.y}px)`,
                    userSelect: cameraPanelDrag ? "none" : "auto",
                  }}
                >
                  <div className="camera-feed-header" onMouseDown={onCameraHeaderMouseDown}>
                    <h3>Live Camera Feed: {selectedCamera.label}</h3>
                    <button
                      type="button"
                      className="camera-feed-close"
                      aria-label="Zamknij podglad kamery"
                      onClick={() => {
                        setSelectedCamera(null);
                        setCameraPanelDrag(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div
                    className={`camera-feed-alert camera-feed-alert--${selectedCamera.alertLevel}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className={`camera-feed-alert-badge camera-feed-alert-badge--${selectedCamera.alertLevel}`}>
                      ALERT
                    </span>
                    <span>{`Psy miejskie: ${selectedCamera.alertText}`}</span>
                  </div>
                  {CAMERA_FEED_SRC.trim().length > 0 ? (
                    <video
                      className="vjs-tech camera-feed-video"
                      id="vjs_video_3_html5_api"
                      tabIndex={-1}
                      preload="metadata"
                      src={CAMERA_FEED_SRC}
                      autoPlay
                      controls
                      muted
                      playsInline
                    />
                  ) : (
                    <>
                      <div ref={cameraEmbedRef} className="camera-feed-embed" />
                      {cameraEmbedStatus === "loading" && <p className="camera-feed-note">Ladowanie odtwarzacza...</p>}
                      {cameraEmbedStatus === "error" && (
                        <p className="camera-feed-note">
                          Nie udalo sie osadzic playera. Otworz kamere bezposrednio w nowej karcie.
                        </p>
                      )}
                      <a
                        className="camera-feed-link"
                        href={selectedCamera.pageUrl ?? CAMERA_FEED_PAGE_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Otworz strone kamery
                      </a>
                    </>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <div className="module-panel">
              <h3>{sectionTitles[activeSection]}</h3>
              <p>{sectionDescriptions[activeSection as Exclude<SidebarSection, "current-view">]}</p>
              <button type="button" className="module-panel-btn">
                Otworz modul
              </button>
            </div>
          )}
          
          {selectedNode && (
            <div 
              className="node-details-panel"
              style={{
                transform: `translate(${nodeDetailPos.x}px, ${nodeDetailPos.y}px)`,
                userSelect: nodeDetailDrag ? "none" : "auto",
              }}
            >
              <div 
                className="node-details-header"
                onMouseDown={onNodeDetailHeaderMouseDown}
              >
                <div className="node-details-title">
                  <div className="node-type-badge">{selectedNode.node_type}</div>
                  <h3>{selectedNode.node_id}</h3>
                </div>
                <button type="button" className="node-details-close" onClick={() => setSelectedNodeId(null)}>
                  ×
                </button>
              </div>
              <div className="node-details-body">
                <div className="node-info-section">
                  <h4>Informacje</h4>
                  <div className="info-field">
                    <span className="label">Typ:</span>
                    <span className="value node-type-value">{selectedNode.node_type}</span>
                  </div>
                  <div className="info-field">
                    <span className="label">ID:</span>
                    <span className="value id-value">{selectedNode.node_id}</span>
                  </div>
                </div>

                {Object.entries(selectedNode.node_data).length > 0 && (
                  <div className="node-info-section">
                    <h4>Wlasciwosci</h4>
                    <div className="properties-list">
                      {Object.entries(selectedNode.node_data).map(([key, value]) => (
                        <div key={key} className="prop-item">
                          <span className="prop-key">{key}</span>
                          {renderPropertyValue(key, value)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNodeEdges.length > 0 && (
                  <div className="node-info-section">
                    <h4>Istniejace Polaczenia ({selectedNodeEdges.length})</h4>
                    <div className="connections-list">
                      {selectedNodeEdges.map((edge, index) => (
                        <div key={`${edge.source_id}-${edge.target_id}-${edge.edge_type}-${index}`} className="connection-item">
                          <span className="conn-from">{edge.source_id.split(":")[1]}</span>
                          <span className="conn-type">{edge.edge_type}</span>
                          <span className="conn-to">{edge.target_id.split(":")[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
      </section>



      <aside className={`chat-offcanvas${chatOpen ? " is-open" : ""}`}>
        <div className="offcanvas-header">
          <h3>AI Chat</h3>
          <button type="button" className="offcanvas-close" onClick={() => setChatOpen(false)}>
            Zamknij
          </button>
        </div>

        <div className="chat-body">
          <div className="chat-messages">
            {chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                <p className="chat-role">{message.role === "assistant" ? "AI" : "Operator"}</p>
                <p>{message.content}</p>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={sendChatMessage}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Wpisz polecenie lub pytanie..."
              disabled={chatLoading}
            />
            <button type="submit" disabled={chatLoading || chatInput.trim().length === 0}>
              {chatLoading ? "Wysylanie..." : "Wyslij"}
            </button>
          </form>
        </div>
      </aside>

      {chatOpen && (
        <button
          aria-label="Zamknij AI Chat"
          type="button"
          className="offcanvas-backdrop"
          onClick={() => {
            setChatOpen(false);
          }}
        />
      )}

      {mobileSidebarOpen && (
        <button
          aria-label="Zamknij panel boczny"
          type="button"
          className="mobile-sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </main>
  );
}
