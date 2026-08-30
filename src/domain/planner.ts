import { findShortestPath } from "./dijkstra";
import { validateTransportPlan } from "./safety";
import type {
  Agv,
  HeroScenarioState,
  NodeId,
  PlanTransportInput,
  PlanTransportResult,
  PlanningStageTrace,
  PlanningTrace,
  RouteResult,
  TransportPlan,
} from "./types";

type Clock = () => number;

function defaultClock(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function roundMs(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}

export function planTransport(
  state: HeroScenarioState,
  input: PlanTransportInput,
  clock: Clock = defaultClock,
): PlanTransportResult {
  const stages: PlanningStageTrace[] = [];
  const startedAt = clock();

  function measure<T>(id: string, label: string, operation: () => { value: T; evidence: string }): T {
    const start = clock();
    const { value, evidence } = operation();
    stages.push({ id, label, durationMs: roundMs(clock() - start), evidence });
    return value;
  }

  const pallet = measure("inspect-pallet", "Inspect pallet state", () => {
    const value = input.palletId === state.pallet.id ? state.pallet : null;
    return { value, evidence: value ? `${value.id} ${value.status} at ${value.nodeId}` : `${input.palletId} not found` };
  });

  const destination = measure("check-destination", "Check destination", () => {
    const value = state.nodes.find((node) => node.id === input.destinationId) ?? null;
    return { value, evidence: value ? `${value.id} available` : `${input.destinationId} not found` };
  });

  const candidates = measure("evaluate-agvs", "Evaluate AGVs", () => {
    const available = state.fleet.filter((agv) => agv.status === "idle" && agv.currentTaskId === null);
    const value = input.agvId ? state.fleet.filter((agv) => agv.id === input.agvId) : available;
    return { value, evidence: `${available.length} available / ${value.length} considered` };
  });

  const route = measure<RouteResult | null>("calculate-routes", "Calculate routes", () => {
    if (!pallet || !destination) return { value: null, evidence: "Route skipped: endpoint missing" };
    const value = findShortestPath(state.nodes, state.edges, pallet.nodeId, destination.id);
    return { value, evidence: value.found ? `${value.distanceMeters.toFixed(1)} m / ${value.path.length} nodes` : "No route found" };
  });

  const selectedCandidate = candidates
    .slice()
    .sort((a, b) => {
      const preferredDelta = Number(b.id === state.preferredAgvId) - Number(a.id === state.preferredAgvId);
      return preferredDelta || b.batteryPercent - a.batteryPercent || a.id.localeCompare(b.id);
    })[0] ?? null;

  const batteryAfter = measure<number | null>("battery-reserve", "Battery reserve", () => {
    if (!selectedCandidate || !route?.found) return { value: null, evidence: "Battery estimate unavailable" };
    const value = selectedCandidate.batteryPercent - Math.ceil(route.distanceMeters / 6);
    return { value, evidence: `${selectedCandidate.batteryPercent}% -> ${value}%` };
  });

  const safety = measure("safety-constraints", "Safety constraints", () => {
    const value = validateTransportPlan(state, {
      palletId: input.palletId,
      destinationId: input.destinationId,
      agv: selectedCandidate,
      route,
      estimatedBatteryAfter: batteryAfter,
    });
    return { value, evidence: value.status === "safe" ? `${value.checks.length}/${value.checks.length} checks passed` : value.reason ?? "Rejected" };
  });

  const selectedAgv = measure<Agv | null>("select-vehicle", "Select vehicle", () => ({
    value: safety.status === "safe" ? selectedCandidate : null,
    evidence: safety.status === "safe" ? `${selectedCandidate?.id ?? "none"} selected` : "Selection rejected by safety",
  }));

  const trace: PlanningTrace = {
    requestId: `${state.runId}-PLAN-${state.metrics.toolCalls + state.metrics.transportAttempts + 1}`,
    startedAt,
    totalPlanningMs: roundMs(clock() - startedAt),
    stages,
    result: safety.status,
  };

  if (safety.status === "rejected" || !pallet || !destination || !route?.found || !selectedAgv || batteryAfter === null) {
    return { status: "rejected", reason: safety.reason ?? "Transport plan rejected.", safety, trace };
  }

  const plan: TransportPlan = {
    palletId: pallet.id,
    sourceId: pallet.nodeId,
    destinationId: destination.id as NodeId,
    recommendedAgvId: selectedAgv.id,
    plannedRoute: route.path,
    distanceMeters: route.distanceMeters,
    estimatedSeconds: Math.round(route.distanceMeters / selectedAgv.speedMps),
    batteryBefore: selectedAgv.batteryPercent,
    estimatedBatteryAfter: batteryAfter,
    safety,
    explanation: `${selectedAgv.id} is the preferred available HERO unit under the deterministic policy ranking and remains above the ${state.safetyReservePercent}% reserve.`,
  };
  return { status: "plan_available", plan, trace };
}

export function createPlanFingerprint(plan: TransportPlan, worldRevision: number): string {
  return [
    worldRevision,
    plan.palletId,
    plan.sourceId,
    plan.destinationId,
    plan.recommendedAgvId,
    plan.plannedRoute.join(">"),
    plan.distanceMeters.toFixed(3),
    plan.estimatedBatteryAfter,
    plan.safety.status,
  ].join("|");
}
