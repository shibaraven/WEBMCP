"use client";

import { useMemo, useState } from "react";
import { blockHeroEdge, calculateHeroRoute, resetHeroScenario, setRouteEdgeBlocked, verifyHeroContract } from "../domain/heroScenario";
import { createHeroState, HERO_BLOCKED_EDGE } from "../domain/heroSeed";
import type { HeroScenarioState, NodeId, WarehouseEdge, WarehouseNode } from "../domain/types";

const statusLabels = { idle: "IDLE", moving: "MOVING", charging: "CHARGING", maintenance: "MAINTENANCE" } as const;

function edgeIsInRoute(edge: WarehouseEdge, path: readonly NodeId[]) {
  return path.some((nodeId, index) => {
    const next = path[index + 1];
    return (nodeId === edge.from && next === edge.to) || (nodeId === edge.to && next === edge.from);
  });
}

function MapEdge({ edge, nodes, active }: { edge: WarehouseEdge; nodes: readonly WarehouseNode[]; active: boolean }) {
  const from = nodes.find((node) => node.id === edge.from)!;
  const to = nodes.find((node) => node.id === edge.to)!;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const width = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <span
      aria-hidden="true"
      className={`map-edge${active ? " map-edge--active" : ""}${edge.blocked ? " map-edge--blocked" : ""}`}
      style={{ left: `${from.x}%`, top: `${from.y}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }}
    />
  );
}

function WarehouseMap({ state }: { state: HeroScenarioState }) {
  const route = calculateHeroRoute(state);
  return (
    <div className="warehouse-map" aria-label="HERO-001 warehouse route map">
      <div className="map-grid" aria-hidden="true" />
      {state.edges.map((edge) => <MapEdge key={edge.id} edge={edge} nodes={state.nodes} active={edgeIsInRoute(edge, route.path)} />)}
      {state.nodes.map((node) => (
        <div key={node.id} className={`map-node map-node--${node.kind}`} style={{ left: `${node.x}%`, top: `${node.y}%` }}>
          <span className="map-node-dot" /><span className="map-node-label">{node.label}</span>
        </div>
      ))}
      <div className="map-asset map-asset--pallet" style={{ left: "5%", top: "57%" }}>P-104</div>
      <div className="map-asset map-asset--agv" style={{ left: "11%", top: "7%" }}>AGV-03 · 86%</div>
    </div>
  );
}

export function CommandCenterShell() {
  const [state, setState] = useState(createHeroState);
  const [resetCount, setResetCount] = useState(0);
  const route = useMemo(() => calculateHeroRoute(state), [state]);
  const contract = useMemo(() => verifyHeroContract(state), [state]);
  const heroEdgeBlocked = state.edges.some((edge) => edge.id === "E-07-09" && edge.blocked);

  function reset() {
    setState(resetHeroScenario());
    setResetCount((count) => count + 1);
  }

  function restoreGoldenPath() {
    setState((current) => setRouteEdgeBlocked(current, HERO_BLOCKED_EDGE[0], HERO_BLOCKED_EDGE[1], false));
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Physical AI Command Center home">
          <span className="brand-mark">PA</span>
          <span><strong>PHYSICAL AI</strong><small>COMMAND CENTER</small></span>
        </a>
        <div className="topbar-status"><span><i className="status-dot" /> CORE ONLINE</span><span>PHASE 01 / PUBLIC SHELL</span></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>HERO-001</span> DETERMINISTIC WAREHOUSE DOMAIN</div>
        <div className="hero-grid">
          <div>
            <h1>One scenario.<br /><em>Zero ambiguity.</em></h1>
            <p>A deterministic control surface for routing pallet P-104 from Inbound 01 to Rack A12. The first competition milestone is live: domain state, Dijkstra replanning and a provable reset.</p>
            <div className="hero-actions">
              <button className="button button--primary" onClick={() => setState((current) => blockHeroEdge(current))} disabled={heroEdgeBlocked}>Block N07 → N09</button>
              <button className="button" onClick={restoreGoldenPath} disabled={!heroEdgeBlocked}>Restore golden path</button>
              <button className="button button--ghost" onClick={reset}>Reset HERO-001</button>
            </div>
          </div>
          <div className="hero-summary">
            <span className="summary-kicker">CURRENT SOLUTION</span>
            <strong>{route.distanceMeters.toFixed(1)}<small> m</small></strong>
            <span>{route.path.join(" → ")}</span>
            <div className="summary-meta">
              <span>{route.visitedNodeCount} nodes evaluated</span>
              <span className={heroEdgeBlocked ? "warning" : "nominal"}>{heroEdgeBlocked ? "REPLAN ACTIVE" : "GOLDEN PATH"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="command-grid">
        <article className="panel map-panel">
          <div className="panel-heading"><div><span className="panel-index">01</span><h2>Route topology</h2></div><span className="live-label"><i className="status-dot" /> LIVE DOMAIN</span></div>
          <WarehouseMap state={state} />
          <div className="map-legend"><span><i className="legend-line legend-line--active" /> Selected route</span><span><i className="legend-line" /> Available edge</span><span><i className="legend-line legend-line--blocked" /> Blocked edge</span></div>
        </article>

        <aside className="panel contract-panel">
          <div className="panel-heading"><div><span className="panel-index">02</span><h2>Seed contract</h2></div><span className="score">{contract.filter((item) => item.passed).length}/{contract.length}</span></div>
          <div className="contract-list">
            {contract.map((item) => <div key={item.label} className="contract-row"><span>{item.label}</span><strong>{item.passed ? "PASS" : "FAIL"}</strong></div>)}
          </div>
          <div className="reset-proof"><span>RESET PROOF</span><strong>Deep-equal + reference-isolated</strong><small>{resetCount === 0 ? "Ready for operator reset" : `Verified in this session × ${resetCount}`}</small></div>
        </aside>
      </section>

      <section className="fleet-section">
        <div className="section-heading"><div><span className="panel-index">03</span><h2>Fleet snapshot</h2></div><p>Preferred unit: <strong>AGV-03</strong> · Safety reserve: <strong>20%</strong></p></div>
        <div className="fleet-grid">
          {state.fleet.map((agv) => (
            <article className={`agv-card${agv.id === state.preferredAgvId ? " agv-card--preferred" : ""}`} key={agv.id}>
              <div><strong>{agv.id}</strong><span className={`agv-status agv-status--${agv.status}`}>{statusLabels[agv.status]}</span></div>
              <span className="agv-battery">{agv.batteryPercent}<small>%</small></span>
              <div className="battery-track"><i style={{ width: `${agv.batteryPercent}%` }} /></div>
              <small>{agv.nodeId}{agv.currentTaskId ? ` · ${agv.currentTaskId}` : " · AVAILABLE"}</small>
            </article>
          ))}
        </div>
      </section>

      <footer><span>PHYSICAL AI × WEBMCP</span><span>HERO-001 / SEED hero-001-v1</span><span>ADAPTER LAYER: NEXT MILESTONE</span></footer>
    </main>
  );
}
