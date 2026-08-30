"use client";

import { useMemo } from "react";
import { calculateHeroRoute } from "../domain/heroScenario";
import type { DecisionStage, HeroScenarioState, NodeId, WarehouseEdge, WarehouseNode } from "../domain/types";
import { useCommandCenter } from "../store/useCommandCenter";
import { WEBMCP_TOOL_NAMES } from "../webmcp/tools";

const decisionStages: DecisionStage[] = ["OBSERVE", "PLAN", "VALIDATE", "APPROVE", "EXECUTE", "RECOVER"];
const statusLabels = {
  idle: "IDLE",
  moving: "MOVING",
  waiting: "WAITING",
  blocked: "BLOCKED",
  charging: "CHARGING",
  maintenance: "MAINTENANCE",
} as const;

function edgeIndexInRoute(edge: WarehouseEdge, path: readonly NodeId[]) {
  return path.findIndex((nodeId, index) => {
    const next = path[index + 1];
    return (nodeId === edge.from && next === edge.to) || (nodeId === edge.to && next === edge.from);
  });
}

function MapEdge({
  edge,
  nodes,
  route,
  routeIndex,
}: {
  edge: WarehouseEdge;
  nodes: readonly WarehouseNode[];
  route: readonly NodeId[];
  routeIndex: number;
}) {
  const from = nodes.find((node) => node.id === edge.from)!;
  const to = nodes.find((node) => node.id === edge.to)!;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const width = Math.sqrt(dx * dx + dy * dy).toFixed(3);
  const angle = (Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(3);
  const activeIndex = edgeIndexInRoute(edge, route);
  const active = activeIndex >= 0;
  const traversed = active && activeIndex < routeIndex;
  return (
    <span
      aria-hidden="true"
      className={`map-edge${active ? " map-edge--active" : ""}${traversed ? " map-edge--traversed" : ""}${edge.blocked ? " map-edge--blocked" : ""}`}
      style={{ left: `${from.x}%`, top: `${from.y}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }}
    />
  );
}

function assetPosition(state: HeroScenarioState, nodeId: NodeId, offsetX = 0, offsetY = 0) {
  const node = state.nodes.find((item) => item.id === nodeId)!;
  return { left: `${node.x + offsetX}%`, top: `${node.y + offsetY}%` };
}

function WarehouseMap({ state }: { state: HeroScenarioState }) {
  const fallbackRoute = calculateHeroRoute(state).path;
  const route = state.mission?.route ?? state.proposal?.plannedRoute ?? fallbackRoute;
  const routeIndex = state.mission?.routeIndex ?? 0;
  const heroAgv = state.fleet.find((agv) => agv.id === "AGV-03")!;
  return (
    <div className="warehouse-map" aria-label="Live HERO-001 warehouse digital twin">
      <div className="map-grid" aria-hidden="true" />
      {state.edges.map((edge) => (
        <MapEdge key={edge.id} edge={edge} nodes={state.nodes} route={route} routeIndex={routeIndex} />
      ))}
      {state.nodes.map((node) => (
        <div key={node.id} className={`map-node map-node--${node.kind}`} style={{ left: `${node.x}%`, top: `${node.y}%` }}>
          <span className="map-node-dot" /><span className="map-node-label">{node.label}</span>
        </div>
      ))}
      <div className="map-asset map-asset--pallet" style={assetPosition(state, state.pallet.nodeId, -3, 8)}>
        P-104 / {state.pallet.status.toUpperCase()}
      </div>
      <div className={`map-asset map-asset--agv map-asset--${heroAgv.status}`} style={assetPosition(state, heroAgv.nodeId, -4, -13)}>
        AGV-03 / {heroAgv.batteryPercent}%
      </div>
      {state.edges.some((edge) => edge.id === "E-07-09" && edge.blocked) && (
        <div className="blockage-flag" style={{ left: "56%", top: "36%" }}>AISLE BLOCKED</div>
      )}
    </div>
  );
}

function DecisionPipeline({ state }: { state: HeroScenarioState }) {
  return (
    <section className="decision-pipeline" aria-label="Agent decision pipeline">
      <div className="pipeline-label"><span>AGENT DECISION PIPELINE</span><small>VERIFIABLE SYSTEM STATE</small></div>
      <div className="pipeline-stages">
        {decisionStages.map((stage, index) => (
          <div className={`decision-stage decision-stage--${state.decisionPipeline[stage]}`} key={stage}>
            <i>{String(index + 1).padStart(2, "0")}</i><span>{stage}</span><b>{state.decisionPipeline[stage]}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApprovalPanel({
  state,
  onPropose,
  onApprove,
  onReject,
  onReplan,
}: {
  state: HeroScenarioState;
  onPropose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReplan: () => void;
}) {
  const proposal = state.proposal;
  const mission = state.mission;

  if (!proposal) {
    return (
      <div className="approval-empty">
        <span>NO ACTIVE PROPOSAL</span>
        <p>Create a deterministic plan for P-104. Planning never starts a mission.</p>
        <button className="button button--primary button--wide" onClick={onPropose}>Create safe proposal</button>
      </div>
    );
  }

  return (
    <div className="approval-card">
      <div className="approval-state">
        <span>{mission ? `MISSION ${mission.status.toUpperCase()}` : "AGENT PROPOSED ACTION"}</span>
        <strong className={proposal.safety.status === "safe" ? "safe" : "danger"}>{proposal.safety.status.toUpperCase()}</strong>
      </div>
      <h3>Move P-104</h3>
      <p>{proposal.sourceId} <b>-&gt;</b> {proposal.destinationId}</p>
      <dl>
        <div><dt>AGV</dt><dd>{proposal.recommendedAgvId}</dd></div>
        <div><dt>Distance</dt><dd>{proposal.distanceMeters.toFixed(1)} m</dd></div>
        <div><dt>ETA</dt><dd>{proposal.estimatedSeconds} sec</dd></div>
        <div><dt>Battery</dt><dd>{proposal.batteryBefore}% -&gt; {proposal.estimatedBatteryAfter}%</dd></div>
      </dl>
      {mission && <div className="mission-progress"><i style={{ width: `${mission.progressPercent}%` }} /><span>{mission.progressPercent}%</span></div>}
      {proposal.status === "waiting" && (
        <div className="approval-actions">
          <button className="button button--primary" onClick={onApprove}>Approve</button>
          <button className="button button--danger" onClick={onReject}>Reject</button>
        </div>
      )}
      {mission?.status === "blocked" && (
        <button className="button button--warning button--wide" onClick={onReplan}>Replan blocked mission</button>
      )}
      {proposal.status === "rejected" && (
        <button className="button button--wide" onClick={onPropose}>Create new proposal</button>
      )}
      {mission?.status === "completed" && <div className="completion-banner">P-104 DELIVERED TO RACK-A12</div>}
    </div>
  );
}

export function CommandCenterShell() {
  const { state, webMcp, resetCount, operatorNotice, propose, approve, reject, replan, safetyProbe, reset } = useCommandCenter();
  const route = useMemo(() => state.mission?.route ?? state.proposal?.plannedRoute ?? calculateHeroRoute(state).path, [state]);
  const distance = state.mission?.distanceMeters ?? state.proposal?.distanceMeters ?? calculateHeroRoute(state).distanceMeters;
  const operationState = state.mission?.status ?? (state.proposal?.status === "waiting" ? "approval required" : "ready");

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Physical AI Command Center home">
          <span className="brand-mark">PA</span>
          <span><strong>PHYSICAL AI</strong><small>COMMAND CENTER</small></span>
        </a>
        <div className="topbar-status">
          <span className={`webmcp-badge webmcp-badge--${webMcp.status}`}><i className="status-dot" /> WEBMCP {webMcp.status.toUpperCase()}</span>
          <span>HERO-001 / PUBLIC HTTPS</span>
        </div>
      </header>

      <section className="hero hero--compact" id="top">
        <div>
          <div className="eyebrow"><span>AGENT-NATIVE CONTROL LAYER</span> HUMAN-SUPERVISED PHYSICAL AI</div>
          <h1>Safe intent.<br /><em>Visible execution.</em></h1>
          <p>One WebMCP workflow observes the warehouse, validates a safe plan, requests human approval, stops at a blocked aisle, replans and delivers P-104.</p>
          <div className="hero-actions">
            <button className="button button--primary" onClick={() => propose()} disabled={Boolean(state.mission && state.mission.status !== "completed") || state.proposal?.status === "waiting"}>Create proposal</button>
            <button className="button" onClick={() => safetyProbe("destination")} disabled={Boolean(state.mission)}>Test invalid destination</button>
            <button className="button" onClick={() => safetyProbe("battery")} disabled={Boolean(state.mission)}>Test low battery</button>
            <button className="button button--ghost" onClick={reset}>Reset demo</button>
          </div>
        </div>
        <div className="hero-summary">
          <span className="summary-kicker">OPERATION STATE</span>
          <strong className={`state-word state-word--${operationState.replaceAll(" ", "-")}`}>{operationState.toUpperCase()}</strong>
          <span>{route.join(" -> ")}</span>
          <div className="summary-meta"><span>{distance.toFixed(1)} m planned</span><span>{state.metrics.toolCalls} tool calls</span></div>
        </div>
      </section>

      <div className="operator-notice" role="status" aria-live="polite"><span>SYSTEM EVENT</span>{operatorNotice}</div>
      <DecisionPipeline state={state} />

      <section className="operations-grid">
        <article className="panel digital-twin-panel">
          <div className="panel-heading">
            <div><span className="panel-index">01</span><h2>Digital twin</h2></div>
            <span className="live-label"><i className="status-dot" /> {state.mission?.status.toUpperCase() ?? "LIVE DOMAIN"}</span>
          </div>
          <WarehouseMap state={state} />
          <div className="map-legend"><span><i className="legend-line legend-line--active" /> Planned route</span><span><i className="legend-line legend-line--traversed" /> Traversed</span><span><i className="legend-line legend-line--blocked" /> Blocked</span></div>
          <div className="fleet-strip">
            {state.fleet.map((agv) => (
              <div className={`fleet-unit${agv.id === "AGV-03" ? " fleet-unit--hero" : ""}`} key={agv.id}>
                <div><strong>{agv.id}</strong><span className={`agv-status agv-status--${agv.status}`}>{statusLabels[agv.status]}</span></div>
                <span>{agv.batteryPercent}%</span><small>{agv.nodeId}</small>
              </div>
            ))}
          </div>
        </article>

        <div className="operations-side">
          <article className="panel approval-panel">
            <div className="panel-heading"><div><span className="panel-index">02</span><h2>Human approval</h2></div><span className="score">{state.proposal?.status.toUpperCase() ?? "IDLE"}</span></div>
            <ApprovalPanel state={state} onPropose={() => propose()} onApprove={approve} onReject={reject} onReplan={replan} />
          </article>

          <article className="panel trace-panel">
            <div className="panel-heading">
              <div><span className="panel-index">03</span><h2>WebMCP trace</h2></div>
              <span className={`score score--${webMcp.status}`}>{webMcp.discoveredCount}/7</span>
            </div>
            <div className="trace-status"><strong>{webMcp.message}</strong><small>Real tool results and measured execution latency only.</small></div>
            <div className="trace-list">
              {state.webMcpTrace.length === 0 ? (
                <div className="trace-empty">Waiting for a compatible browser agent to call a tool.</div>
              ) : state.webMcpTrace.slice(0, 6).map((entry) => (
                <div className="trace-row" key={entry.id}>
                  <span className={`trace-mark trace-mark--${entry.status}`} />
                  <div><strong>{entry.toolName}</strong><small>{entry.summary}</small></div>
                  <time>{entry.latencyMs.toFixed(3)} ms</time>
                </div>
              ))}
            </div>
            <details className="tool-catalog"><summary>{WEBMCP_TOOL_NAMES.length} registered tools</summary><p>{WEBMCP_TOOL_NAMES.join(" / ")}</p></details>
          </article>
        </div>
      </section>

      <section className="evidence-grid">
        <article className="panel planning-panel">
          <div className="panel-heading"><div><span className="panel-index">04</span><h2>Measured planning pipeline</h2></div><span className="score">{state.planningTrace ? `${state.planningTrace.totalPlanningMs.toFixed(3)} ms` : "NO TRACE"}</span></div>
          <div className="planning-stages">
            {state.planningTrace ? state.planningTrace.stages.map((stage) => (
              <div className="planning-row" key={stage.id}><span>{stage.label}</span><small>{stage.evidence}</small><strong>{stage.durationMs.toFixed(3)} ms</strong></div>
            )) : <div className="planning-empty">Run plan_transport or create a proposal to generate real stage timing.</div>}
          </div>
        </article>
        <article className="panel safety-panel">
          <div className="panel-heading"><div><span className="panel-index">05</span><h2>Deterministic safety</h2></div><span className={`score ${state.lastSafetyResult?.status === "rejected" ? "danger" : "safe"}`}>{state.lastSafetyResult?.status.toUpperCase() ?? "READY"}</span></div>
          <div className="safety-checks">
            {state.lastSafetyResult ? state.lastSafetyResult.checks.map((check) => (
              <div className="safety-row" key={check.id}><strong>{check.id}</strong><span>{check.label}</span><b className={check.passed ? "safe" : "danger"}>{check.passed ? "PASS" : "REJECT"}</b></div>
            )) : <p>Safety policy owns execution authority. The agent can propose; it cannot bypass validation or approval.</p>}
          </div>
        </article>
      </section>

      <footer><span>PHYSICAL AI x WEBMCP</span><span>RESET VERIFIED x {resetCount}</span><span>AI PROPOSES / SOFTWARE VALIDATES / HUMAN APPROVES</span></footer>
    </main>
  );
}
