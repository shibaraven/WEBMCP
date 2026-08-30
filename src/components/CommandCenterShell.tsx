"use client";

import { useMemo } from "react";
import { MANUAL_BENCHMARK_STEPS } from "../domain/benchmark";
import { evaluateHeroE2E } from "../domain/e2e";
import { calculateHeroRoute } from "../domain/heroScenario";
import { getOperationMetrics } from "../domain/missionEngine";
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
  reserved,
}: {
  edge: WarehouseEdge;
  nodes: readonly WarehouseNode[];
  route: readonly NodeId[];
  routeIndex: number;
  reserved: boolean;
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
      className={`map-edge${active ? " map-edge--active" : ""}${traversed ? " map-edge--traversed" : ""}${reserved ? " map-edge--reserved" : ""}${edge.blocked ? " map-edge--blocked" : ""}`}
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
        <MapEdge
          key={edge.id}
          edge={edge}
          nodes={state.nodes}
          route={route}
          routeIndex={routeIndex}
          reserved={state.trafficReservations.some((reservation) => reservation.edgeId === edge.id)}
        />
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
      {state.trafficReservations.some((reservation) => reservation.edgeId === "E-07-09") && (
        <div className="reservation-flag" style={{ left: "56%", top: "36%" }}>RESERVED / AGV-02</div>
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
        <div><dt>{mission?.replanCount ? "Projected total" : "Distance"}</dt><dd>{(mission?.projectedTotalDistanceMeters ?? proposal.distanceMeters).toFixed(1)} m</dd></div>
        <div><dt>Physical ETA</dt><dd>{proposal.estimatedSeconds} sec / demo 8x</dd></div>
        <div><dt>Battery</dt><dd>{proposal.batteryBefore}% -&gt; {mission?.projectedBatteryAfter ?? proposal.estimatedBatteryAfter}%</dd></div>
      </dl>
      <p className="proposal-explanation">{proposal.explanation}</p>
      <div className="recovery-envelope">
        APPROVED RECOVERY: same destination / +≤{proposal.recoveryPolicy.maxAdditionalDistanceMeters} m / battery ≥{proposal.recoveryPolicy.minBatteryPercent}% / auto-resume
      </div>
      {mission && <div className="mission-progress"><i style={{ width: `${mission.progressPercent}%` }} /><span>{mission.progressPercent}%</span></div>}
      {proposal.status === "waiting" && (
        <div className="approval-actions">
          <button className="button button--primary" onClick={onApprove}>Approve</button>
          <button className="button button--danger" onClick={onReject}>Reject</button>
        </div>
      )}
      {mission?.status === "blocked" && (
        <div className="agent-recovery">
          <strong>AWAITING AGENT: call replan_mission</strong>
          <details><summary>Manual fallback (not counted as WebMCP)</summary><button className="button button--warning button--wide" onClick={onReplan}>Run manual replan fallback</button></details>
        </div>
      )}
      {proposal.status === "rejected" && (
        <button className="button button--wide" onClick={onPropose}>Create new proposal</button>
      )}
      {mission?.status === "completed" && <div className="completion-banner">P-104 DELIVERED TO RACK-A12</div>}
    </div>
  );
}

function formatDuration(value: number | null) {
  if (value === null) return "NOT MEASURED";
  if (value === 0) return "< timer resolution";
  if (value < 0.1) return `${Math.max(1, Math.round(value * 1000))} µs`;
  return `${value.toFixed(3)} ms`;
}

function BenchmarkPanel({
  state,
  onManualStep,
  onArmAgent,
}: {
  state: HeroScenarioState;
  onManualStep: () => void;
  onArmAgent: () => void;
}) {
  const manual = state.benchmark.manual;
  const agent = state.benchmark.agent;
  const nextStep = MANUAL_BENCHMARK_STEPS[manual.stepIndex];
  const agentHumanInputs = agent.humanIntents + agent.humanApprovals;
  const validComparison = manual.status === "completed" && agent.status === "completed" && agent.sequenceVerified;
  const reduction = validComparison && agentHumanInputs > 0
    ? ((manual.humanInteractions - agentHumanInputs) / manual.humanInteractions) * 100
    : null;
  const speedup = validComparison && manual.elapsedMs && agent.elapsedMs ? manual.elapsedMs / agent.elapsedMs : null;

  return (
    <article className="panel benchmark-panel">
      <div className="panel-heading">
        <div><span className="panel-index">06</span><h2>Human vs Agent - live benchmark</h2></div>
        <span className="score">SAME ENGINE / SAME ENDPOINT</span>
      </div>
      <div className="benchmark-boundary">
        <span>START: first task-specific action</span><i />
        <span>STOP: TP-001 rendered</span>
      </div>
      <div className="benchmark-columns">
        <div className="benchmark-mode">
          <small>MANUAL UI</small>
          <strong>{manual.humanInteractions} interactions</strong>
          <span>{formatDuration(manual.elapsedMs)}</span>
          <p>{manual.lastEvidence}</p>
          {manual.status !== "completed" ? (
            <button className="button button--wide" onClick={onManualStep} disabled={Boolean(state.mission) || state.benchmark.mode === "agent"}>
              {nextStep?.label ?? "Manual complete"}
            </button>
          ) : (
            <button className="button button--primary button--wide" onClick={onArmAgent}>Arm fresh Agent benchmark</button>
          )}
        </div>
        <div className="benchmark-mode benchmark-mode--agent">
          <small>WEBMCP AGENT</small>
          <strong>{agent.humanIntents} intent + {agent.humanApprovals} approval</strong>
          <span>Wall clock: {formatDuration(agent.elapsedMs)}</span>
          <p>{agent.toolCalls} verified WebMCP calls / {formatDuration(agent.toolComputeMs)} tool compute. Approval is recorded outside the intent→proposal timer.</p>
          <div className={`benchmark-state benchmark-state--${agent.status}`}>{agent.status.toUpperCase()}</div>
        </div>
        <div className="benchmark-mode benchmark-mode--comparison">
          <small>MEASURED COMPARISON</small>
          <strong>{reduction === null ? "PENDING" : `${reduction.toFixed(1)}% fewer interactions`}</strong>
          <span>{speedup === null ? "Speedup pending" : `${speedup.toFixed(2)}x decision speed`}</span>
          <p>Both modes call the same planner, safety policy and proposal engine.</p>
        </div>
      </div>
    </article>
  );
}

function MetricsPanel({ state }: { state: HeroScenarioState }) {
  const metrics = getOperationMetrics(state);
  const percent = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(0)}%`;
  return (
    <article className="panel metrics-panel">
      <div className="panel-heading">
        <div><span className="panel-index">07</span><h2>Measured operation metrics</h2></div>
        <span className="score">RUNTIME ONLY</span>
      </div>
      <div className="metric-grid">
        <div><small>TOOL CALLS</small><strong>{metrics.toolCalls}</strong><span>{metrics.toolCalls === 0 ? "N/A latency" : `${formatDuration(metrics.averageToolLatencyMs)} avg`}</span></div>
        <div><small>HUMAN APPROVALS</small><strong>{metrics.operatorApprovals}</strong><span>{metrics.operatorRejections} rejected</span></div>
        <div><small>MISSION SUCCESS</small><strong>{percent(metrics.missionSuccessRate)}</strong><span>{metrics.completedMissions}/{metrics.transportAttempts} completed</span></div>
        <div><small>REPLAN SUCCESS</small><strong>{percent(metrics.blockedRouteRecoveryRate)}</strong><span>{metrics.successfulReplans}/{metrics.replanAttempts} recovered</span></div>
        <div><small>UNSAFE REJECTION</small><strong>{percent(metrics.unsafeRequestRejectionRate)}</strong><span>{metrics.unsafeRejections}/{metrics.unsafeRequests} blocked</span></div>
        <div><small>ROUTE / AGV</small><strong>{metrics.routeLengthMeters.toFixed(1)} m</strong><span>original {metrics.originalRouteLengthMeters.toFixed(1)} / remaining {metrics.remainingRouteLengthMeters.toFixed(1)} / {metrics.selectedAgv ?? "not selected"}</span></div>
        <div><small>INDUSTRIAL FAULT</small><strong>{percent(metrics.industrialFaultSafeResponseRate)}</strong><span>{metrics.industrialFaultSafeResponses}/{metrics.industrialFaultTests} safe responses</span></div>
      </div>
    </article>
  );
}

function IndustrialResiliencePanel({ state }: { state: HeroScenarioState }) {
  const expiredAgvs = state.fleet.filter((agv) => agv.heartbeatStatus === "expired");
  const reservation = state.trafficReservations[0];
  return (
    <article className="panel resilience-panel">
      <div className="panel-heading">
        <div><span className="panel-index">06</span><h2>Industrial resilience</h2></div>
        <span className={`score ${state.telemetry.faultState === "none" ? "safe" : "danger"}`}>{state.telemetry.faultState.replaceAll("_", " ").toUpperCase()}</span>
      </div>
      <div className="resilience-grid">
        <div>
          <small>SAFE-11 / COMMUNICATION</small>
          <strong className={expiredAgvs.length ? "danger" : "safe"}>{expiredAgvs.length ? "HEARTBEAT EXPIRED" : "ALL ONLINE"}</strong>
          <span>{expiredAgvs.length ? `${expiredAgvs.map((agv) => agv.id).join(", ")} unavailable for assignment` : "Planner accepts only live AGV heartbeats"}</span>
        </div>
        <div>
          <small>SAFE-12 / TRAFFIC RESERVATION</small>
          <strong className={reservation ? "danger" : "safe"}>{reservation ? `${reservation.from}-${reservation.to} RESERVED` : "SEGMENTS CLEAR"}</strong>
          <span>{reservation ? `Owned by ${reservation.reservedByAgvId}; foreign AGVs must wait or replan` : "No foreign segment conflict"}</span>
        </div>
        <div className="resilience-trace">
          <small>DETERMINISTIC FAULT TRACE</small>
          {state.telemetry.trace.length ? state.telemetry.trace.slice(-3).map((entry) => <span key={entry}>{entry}</span>) : <span>No industrial fault injected.</span>}
        </div>
      </div>
    </article>
  );
}

function LiveE2EPanel({ state, discoveredCount }: { state: HeroScenarioState; discoveredCount: number }) {
  const proof = evaluateHeroE2E(state, discoveredCount);
  return (
    <article className="panel live-e2e-panel">
      <div className="panel-heading">
        <div><span className="panel-index">08</span><h2>Live Agent E2E proof</h2></div>
        <span className={`score ${proof.verified ? "safe" : ""}`}>{proof.verified ? "VERIFIED" : "AWAITING AGENT"}</span>
      </div>
      <div className="e2e-proof">
        <div><small>PRODUCTION DISCOVERY</small><strong>{proof.discoveredCount}/7 registered</strong></div>
        <div><small>WEBMCP COVERAGE</small><strong>{proof.invokedCount}/7 invoked</strong></div>
        <div><small>ORDERED HERO FLOW</small><strong>{proof.orderedSequence ? "PASS" : "PENDING"}</strong></div>
        <div><small>HERO OUTCOME</small><strong>{state.mission?.status.toUpperCase() ?? "NOT RUN"}</strong></div>
        <div><small>METRICS AFTER COMPLETE</small><strong>{proof.metricsAfterCompletion ? "PASS" : "PENDING"}</strong></div>
      </div>
      <details>
        <summary>Copy the complete Hero Prompt</summary>
        <p>Move pallet P-104 from INBOUND-01 to RACK-A12 safely. Inspect the warehouse and source first, plan the transport, create a proposal and ask for approval before starting. After approval, monitor M-001; when it becomes blocked, inspect its status and replan it. After completion, return operation metrics. Use all seven available warehouse tools during this workflow.</p>
      </details>
    </article>
  );
}

export function CommandCenterShell() {
  const {
    state,
    webMcp,
    resetCount,
    operatorNotice,
    propose,
    approve,
    reject,
    replan,
    safetyProbe,
    reset,
    manualBenchmarkStep,
    armAgentBenchmark,
  } = useCommandCenter();
  const route = useMemo(() => state.mission?.route ?? state.proposal?.plannedRoute ?? calculateHeroRoute(state).path, [state]);
  const distance = state.mission?.distanceMeters ?? state.proposal?.distanceMeters ?? calculateHeroRoute(state).distanceMeters;
  const operationState = state.mission?.status ?? (state.proposal?.status === "waiting" ? "approval required" : "ready");
  const industrialFaultLocked = Boolean(state.mission) || state.telemetry.faultState !== "none";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Physical AI Command Center home">
          <span className="brand-mark">PA</span>
          <span><strong>PHYSICAL AI</strong><small>COMMAND CENTER</small></span>
        </a>
        <div className="topbar-status">
          <span className={`webmcp-badge webmcp-badge--${webMcp.status}`}><i className="status-dot" /> WEBMCP {webMcp.status.toUpperCase()}</span>
          <span>DETERMINISTIC SIMULATOR / DEMO 8X</span>
          <span>HERO-001 / PUBLIC HTTPS</span>
        </div>
      </header>

      <section className="hero hero--compact" id="top">
        <div>
          <div className="eyebrow"><span>AGENT-NATIVE CONTROL LAYER</span> HUMAN-SUPERVISED PHYSICAL AI</div>
          <h1>Safe intent. <em>Visible execution.</em></h1>
          <p>One WebMCP workflow observes the warehouse, validates a safe plan, requests human approval, stops at a blocked aisle, replans and delivers P-104.</p>
          <div className="hero-actions">
            <button className="button button--primary" onClick={() => propose()} disabled={Boolean(state.mission && state.mission.status !== "completed") || state.proposal?.status === "waiting"}>Create proposal</button>
            <button className="button" onClick={() => safetyProbe("destination")} disabled={Boolean(state.mission)}>Test invalid destination</button>
            <button className="button" onClick={() => safetyProbe("battery")} disabled={Boolean(state.mission)}>Test low battery</button>
            <button className="button" onClick={() => safetyProbe("communication")} disabled={industrialFaultLocked}>Test communication loss</button>
            <button className="button" onClick={() => safetyProbe("traffic")} disabled={industrialFaultLocked}>Test traffic conflict</button>
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
          <div className="map-legend"><span><i className="legend-line legend-line--active" /> Planned route</span><span><i className="legend-line legend-line--traversed" /> Traversed</span><span><i className="legend-line legend-line--blocked" /> Blocked</span><span>Physical ETA 48s / demo speed 8x</span></div>
          <div className="fleet-strip">
            {state.fleet.map((agv) => (
              <div className={`fleet-unit${agv.id === "AGV-03" ? " fleet-unit--hero" : ""}`} key={agv.id}>
                <div><strong>{agv.id}</strong><span className={`agv-status agv-status--${agv.heartbeatStatus === "expired" ? "offline" : agv.status}`}>{agv.heartbeatStatus === "expired" ? "COMMS LOST" : statusLabels[agv.status]}</span></div>
                <span>{agv.batteryPercent}%</span><small>{agv.nodeId} / heartbeat {agv.heartbeatStatus}</small>
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
            <div className="trace-status"><strong>{webMcp.message}</strong><small>WebMCP-origin calls only / run {state.runId} / real latency.</small></div>
            <div className="trace-list">
              {state.webMcpTrace.length === 0 ? (
                <div className="trace-empty">Waiting for a compatible browser agent to call a tool.</div>
              ) : state.webMcpTrace.slice(0, 10).map((entry) => (
                <div className="trace-row" key={entry.id}>
                  <span className={`trace-mark trace-mark--${entry.status}`} />
                  <div title={`${entry.inputSummary} → ${entry.summary}`}><strong>{entry.toolName}</strong><small>IN {entry.inputSummary || "{}"}</small><small>OUT {entry.summary}</small><small>{entry.source.toUpperCase()} / {new Date(entry.timestamp).toLocaleTimeString()} / {entry.runId}</small></div>
                  <time>{formatDuration(entry.latencyMs)}</time>
                </div>
              ))}
            </div>
            <details className="tool-catalog"><summary>{WEBMCP_TOOL_NAMES.length} registered tools</summary><p>{WEBMCP_TOOL_NAMES.join(" / ")}</p></details>
          </article>
        </div>
      </section>

      <section className="evidence-grid">
        <article className="panel planning-panel">
          <div className="panel-heading"><div><span className="panel-index">04</span><h2>Measured planning pipeline</h2></div><span className="score">{state.planningTrace ? formatDuration(state.planningTrace.totalPlanningMs) : "NO TRACE"}</span></div>
          <div className="planning-stages">
            {state.planningTrace ? state.planningTrace.stages.map((stage) => (
              <div className="planning-row" key={stage.id}><span>{stage.label}</span><small>{stage.evidence}</small><strong>{formatDuration(stage.durationMs)}</strong></div>
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

      <section className="resilience-wrap">
        <IndustrialResiliencePanel state={state} />
      </section>

      <section className="measurement-grid">
        <BenchmarkPanel state={state} onManualStep={manualBenchmarkStep} onArmAgent={armAgentBenchmark} />
        <MetricsPanel state={state} />
        <LiveE2EPanel state={state} discoveredCount={webMcp.discoveredCount} />
      </section>

      <section className="reset-proof" aria-label="Complete reset scope">
        <strong>COMPLETE RESET SCOPE</strong>
        <span>MISSION {state.mission ? "ACTIVE" : "0"}</span>
        <span>PROPOSAL {state.proposal ? "ACTIVE" : "0"}</span>
        <span>TRACE {state.webMcpTrace.length}</span>
        <span>METRICS {state.metrics.toolCalls}</span>
        <span>TIMER {state.telemetry.pendingTimerCount}</span>
        <span>HEARTBEAT {state.fleet.filter((agv) => agv.heartbeatStatus === "expired").length}</span>
        <span>RESERVATIONS {state.trafficReservations.length}</span>
        <span>FAULT {state.telemetry.faultState.toUpperCase()}</span>
      </section>

      <footer><span>PHYSICAL AI x WEBMCP</span><span>RESET VERIFIED x {resetCount}</span><span>AI PROPOSES / SOFTWARE VALIDATES / HUMAN APPROVES</span></footer>
    </main>
  );
}
