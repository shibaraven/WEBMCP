import { findShortestPath } from "./dijkstra";
import { HERO_BLOCKED_EDGE } from "./heroSeed";
import { planTransport } from "./planner";
import { validateMissionStart } from "./safety";
import type {
  AgvId,
  HeroScenarioState,
  Mission,
  NodeId,
  PlanTransportInput,
  PlanTransportResult,
  TransportProposal,
} from "./types";

export interface EngineTransition<T> {
  state: HeroScenarioState;
  result: T;
}

function updateAgv(
  state: HeroScenarioState,
  agvId: AgvId,
  changes: Partial<HeroScenarioState["fleet"][number]>,
) {
  return state.fleet.map((agv) => agv.id === agvId ? { ...agv, ...changes } : agv);
}

function withPlanningResult(state: HeroScenarioState, planning: PlanTransportResult): HeroScenarioState {
  const rejected = planning.status === "rejected";
  return {
    ...state,
    planningTrace: planning.trace,
    lastSafetyResult: planning.status === "plan_available" ? planning.plan.safety : planning.safety,
    decisionPipeline: {
      ...state.decisionPipeline,
      OBSERVE: "complete",
      PLAN: "complete",
      VALIDATE: rejected ? "warning" : "complete",
    },
    metrics: rejected
      ? { ...state.metrics, unsafeRejections: state.metrics.unsafeRejections + 1 }
      : state.metrics,
  };
}

export function runTransportPlan(
  state: HeroScenarioState,
  input: PlanTransportInput,
): EngineTransition<PlanTransportResult> {
  const result = planTransport(state, input);
  return { state: withPlanningResult(state, result), result };
}

export function createTransportProposal(
  state: HeroScenarioState,
  input: PlanTransportInput,
): EngineTransition<
  | { status: "approval_required"; proposal: TransportProposal }
  | { status: "rejected"; reason: string }
> {
  const planning = planTransport(state, input);
  const plannedState = withPlanningResult(state, planning);
  if (planning.status === "rejected") {
    return { state: plannedState, result: { status: "rejected", reason: planning.reason } };
  }

  const proposal: TransportProposal = {
    id: "TP-001",
    status: "waiting",
    ...planning.plan,
  };
  return {
    state: {
      ...plannedState,
      proposal,
      mission: null,
      decisionPipeline: { ...plannedState.decisionPipeline, APPROVE: "active" },
      metrics: { ...plannedState.metrics, transportAttempts: plannedState.metrics.transportAttempts + 1 },
    },
    result: { status: "approval_required", proposal },
  };
}

export function approveTransportProposal(
  state: HeroScenarioState,
): EngineTransition<{ status: "approved" | "rejected"; reason?: string; missionId?: string }> {
  if (!state.proposal || state.proposal.status !== "waiting") {
    return { state, result: { status: "rejected", reason: "No proposal is waiting for human approval." } };
  }
  if (state.proposal.safety.status !== "safe") {
    return { state, result: { status: "rejected", reason: "Unsafe proposal cannot be approved." } };
  }

  const proposal = { ...state.proposal, status: "approved" as const };
  const mission: Mission = {
    id: "M-001",
    palletId: proposal.palletId,
    sourceId: proposal.sourceId,
    destinationId: proposal.destinationId,
    agvId: proposal.recommendedAgvId,
    route: [...proposal.plannedRoute],
    previousRoute: null,
    routeIndex: 0,
    status: "approved",
    progressPercent: 0,
    distanceMeters: proposal.distanceMeters,
  };
  return {
    state: {
      ...state,
      proposal,
      mission,
      pallet: { ...state.pallet, status: "reserved" },
      fleet: updateAgv(state, mission.agvId, { status: "waiting", currentTaskId: mission.id }),
      decisionPipeline: { ...state.decisionPipeline, APPROVE: "complete", EXECUTE: "active" },
      metrics: { ...state.metrics, operatorApprovals: state.metrics.operatorApprovals + 1 },
    },
    result: { status: "approved", missionId: mission.id },
  };
}

export function rejectTransportProposal(
  state: HeroScenarioState,
): EngineTransition<{ status: "rejected"; proposalId?: string; reason: string }> {
  if (!state.proposal || state.proposal.status !== "waiting") {
    return { state, result: { status: "rejected", reason: "No proposal is waiting for review." } };
  }
  return {
    state: {
      ...state,
      proposal: { ...state.proposal, status: "rejected" },
      decisionPipeline: { ...state.decisionPipeline, APPROVE: "warning" },
    },
    result: { status: "rejected", proposalId: state.proposal.id, reason: "Human operator rejected the proposal." },
  };
}

export function startApprovedMission(
  state: HeroScenarioState,
): EngineTransition<{ status: "running" | "rejected"; reason?: string; missionId?: string }> {
  const validation = validateMissionStart(state);
  if (validation.status === "rejected" || !state.mission) {
    return { state: { ...state, lastSafetyResult: validation }, result: { status: "rejected", reason: validation.reason ?? "Mission start rejected." } };
  }
  const mission = { ...state.mission, status: "running" as const };
  return {
    state: {
      ...state,
      mission,
      pallet: { ...state.pallet, status: "in_transit", nodeId: mission.sourceId },
      fleet: updateAgv(state, mission.agvId, { status: "moving", nodeId: mission.sourceId }),
      decisionPipeline: { ...state.decisionPipeline, EXECUTE: "active" },
    },
    result: { status: "running", missionId: mission.id },
  };
}

function edgeDistance(state: HeroScenarioState, from: NodeId, to: NodeId): number {
  return state.edges.find((edge) =>
    (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from),
  )?.distanceMeters ?? 0;
}

export function advanceMission(state: HeroScenarioState): EngineTransition<{ status: string; nodeId?: NodeId }> {
  const mission = state.mission;
  if (!mission || mission.status !== "running") {
    return { state, result: { status: "ignored" } };
  }

  const currentNode = mission.route[mission.routeIndex];
  const nextNode = mission.route[mission.routeIndex + 1];
  if (!nextNode) return completeMission(state);

  const nextIndex = mission.routeIndex + 1;
  const distanceDelta = edgeDistance(state, currentNode, nextNode);
  const progressPercent = Math.round((nextIndex / (mission.route.length - 1)) * 100);
  const movedState: HeroScenarioState = {
    ...state,
    mission: { ...mission, routeIndex: nextIndex, progressPercent },
    pallet: { ...state.pallet, nodeId: nextNode },
    fleet: updateAgv(state, mission.agvId, { nodeId: nextNode }),
    telemetry: {
      ...state.telemetry,
      scenarioClockMs: state.telemetry.scenarioClockMs + 1000,
      distanceTravelledMeters: Number((state.telemetry.distanceTravelledMeters + distanceDelta).toFixed(1)),
    },
  };

  const upcomingNode = mission.route[nextIndex + 1];
  const shouldInjectBlockage = !state.blockageInjected && nextNode === "N07" && upcomingNode === "N09";
  if (shouldInjectBlockage) {
    const edges = movedState.edges.map((edge) => edge.id === "E-07-09" ? { ...edge, blocked: true } : edge);
    return {
      state: {
        ...movedState,
        edges,
        blockageInjected: true,
        mission: { ...movedState.mission!, status: "blocked" },
        fleet: updateAgv(movedState, mission.agvId, { status: "blocked" }),
        decisionPipeline: { ...movedState.decisionPipeline, EXECUTE: "warning", RECOVER: "active" },
        telemetry: { ...movedState.telemetry, trace: [...movedState.telemetry.trace, "AISLE_BLOCKED N07-N09"] },
      },
      result: { status: "blocked", nodeId: nextNode },
    };
  }

  if (nextNode === mission.destinationId) return completeMission(movedState);
  return { state: movedState, result: { status: "running", nodeId: nextNode } };
}

export function beginMissionReplan(
  state: HeroScenarioState,
  missionId: string,
): EngineTransition<
  | { status: "route_updated"; previousRoute: NodeId[]; newRoute: NodeId[]; additionalDistanceMeters: number }
  | { status: "rejected"; reason: string }
> {
  const mission = state.mission;
  if (!mission || mission.id !== missionId) return { state, result: { status: "rejected", reason: `Mission ${missionId} does not exist.` } };
  if (mission.status !== "blocked") return { state, result: { status: "rejected", reason: `Mission ${missionId} is not blocked.` } };

  const currentNode = mission.route[mission.routeIndex];
  const previousRoute = mission.route.slice(mission.routeIndex);
  const route = findShortestPath(state.nodes, state.edges, currentNode, mission.destinationId);
  if (!route.found) return { state, result: { status: "rejected", reason: "No safe recovery route exists." } };

  const previousDistance = previousRoute.slice(0, -1).reduce((total, node, index) => total + edgeDistance(state, node, previousRoute[index + 1]), 0);
  const additionalDistanceMeters = Number((route.distanceMeters - previousDistance).toFixed(1));
  return {
    state: {
      ...state,
      mission: { ...mission, status: "replanning", previousRoute, route: route.path, routeIndex: 0, progressPercent: 0, distanceMeters: route.distanceMeters },
      fleet: updateAgv(state, mission.agvId, { status: "waiting" }),
      decisionPipeline: { ...state.decisionPipeline, RECOVER: "active" },
      metrics: { ...state.metrics, successfulReplans: state.metrics.successfulReplans + 1 },
      telemetry: { ...state.telemetry, replans: state.telemetry.replans + 1, trace: [...state.telemetry.trace, "REPLAN N07-N08-N11-RACK-A12"] },
    },
    result: { status: "route_updated", previousRoute, newRoute: route.path, additionalDistanceMeters },
  };
}

export function resumeReplannedMission(state: HeroScenarioState): EngineTransition<{ status: "running" | "ignored" }> {
  if (!state.mission || state.mission.status !== "replanning") return { state, result: { status: "ignored" } };
  return {
    state: {
      ...state,
      mission: { ...state.mission, status: "running" },
      fleet: updateAgv(state, state.mission.agvId, { status: "moving" }),
      decisionPipeline: { ...state.decisionPipeline, EXECUTE: "active", RECOVER: "complete" },
    },
    result: { status: "running" },
  };
}

function completeMission(state: HeroScenarioState): EngineTransition<{ status: "completed"; nodeId: NodeId }> {
  const mission = state.mission!;
  const battery = state.proposal?.estimatedBatteryAfter ?? state.fleet.find((agv) => agv.id === mission.agvId)?.batteryPercent;
  return {
    state: {
      ...state,
      mission: { ...mission, status: "completed", routeIndex: mission.route.length - 1, progressPercent: 100 },
      pallet: { ...state.pallet, status: "stored", nodeId: mission.destinationId },
      fleet: updateAgv(state, mission.agvId, { status: "idle", nodeId: mission.destinationId, batteryPercent: battery, currentTaskId: null }),
      decisionPipeline: { ...state.decisionPipeline, EXECUTE: "complete", RECOVER: state.blockageInjected ? "complete" : state.decisionPipeline.RECOVER },
      metrics: { ...state.metrics, completedMissions: state.metrics.completedMissions + 1 },
      telemetry: { ...state.telemetry, trace: [...state.telemetry.trace, "MISSION_COMPLETED M-001"] },
    },
    result: { status: "completed", nodeId: mission.destinationId },
  };
}

export function getOperationalSnapshot(state: HeroScenarioState) {
  const count = (status: HeroScenarioState["fleet"][number]["status"]) => state.fleet.filter((agv) => agv.status === status).length;
  return {
    scenarioId: state.scenarioId,
    fleet: { idle: count("idle"), moving: count("moving"), charging: count("charging"), blocked: count("blocked") },
    activeMissions: state.mission && !["completed", "failed"].includes(state.mission.status) ? 1 : 0,
    blockedEdges: state.edges.filter((edge) => edge.blocked).map((edge) => `${edge.from}-${edge.to}`),
    waitingPallets: state.pallet.status === "waiting" ? [state.pallet.id] : [],
  };
}

export function inspectLocation(state: HeroScenarioState, locationId: string) {
  const location = state.nodes.find((node) => node.id === locationId);
  if (!location) return { status: "not_found", locationId, reason: `Location ${locationId} does not exist.` };
  const palletPresent = state.pallet.nodeId === location.id;
  const agvs = state.fleet.filter((agv) => agv.nodeId === location.id).map((agv) => agv.id);
  return { status: "ok", locationId: location.id, type: location.kind, occupied: palletPresent || agvs.length > 0, palletId: palletPresent ? state.pallet.id : null, agvIds: agvs };
}

export function getMissionStatus(state: HeroScenarioState, missionId: string) {
  if (!state.mission || state.mission.id !== missionId) return { status: "not_found", missionId };
  const agv = state.fleet.find((item) => item.id === state.mission!.agvId);
  return {
    missionId: state.mission.id,
    status: state.mission.status,
    agvId: state.mission.agvId,
    currentNode: agv?.nodeId ?? null,
    progressPercent: state.mission.progressPercent,
    blockedEdge: state.mission.status === "blocked" ? `${HERO_BLOCKED_EDGE[0]}-${HERO_BLOCKED_EDGE[1]}` : null,
  };
}

export function getOperationMetrics(state: HeroScenarioState) {
  return {
    ...state.metrics,
    missionSuccessRate: state.metrics.transportAttempts === 0 ? 0 : state.metrics.completedMissions / state.metrics.transportAttempts,
    blockedRouteRecoveryRate: state.blockageInjected ? state.metrics.successfulReplans : 0,
    routeLengthMeters: state.mission?.distanceMeters ?? state.proposal?.distanceMeters ?? 0,
    selectedAgv: state.mission?.agvId ?? state.proposal?.recommendedAgvId ?? null,
  };
}
