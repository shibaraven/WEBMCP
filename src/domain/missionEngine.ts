import { findShortestPath } from "./dijkstra";
import { HERO_BLOCKED_EDGE } from "./heroSeed";
import { createPlanFingerprint, planTransport } from "./planner";
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
      ? {
          ...state.metrics,
          unsafeRequests: state.metrics.unsafeRequests + 1,
          unsafeRejections: state.metrics.unsafeRejections + 1,
        }
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
  nowEpochMs = Date.now(),
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
    plannedWorldRevision: state.worldRevision,
    planFingerprint: createPlanFingerprint(planning.plan, state.worldRevision),
    createdAtMs: nowEpochMs,
    expiresAtMs: nowEpochMs + 5 * 60 * 1000,
    recoveryPolicy: {
      sameDestinationOnly: true,
      maxAdditionalDistanceMeters: 10,
      minBatteryPercent: state.safetyReservePercent,
      autoResume: true,
    },
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
  nowEpochMs = Date.now(),
): EngineTransition<{ status: "approved" | "rejected"; reason?: string; missionId?: string }> {
  if (!state.proposal || state.proposal.status !== "waiting") {
    return { state, result: { status: "rejected", reason: "No proposal is waiting for human approval." } };
  }
  if (state.proposal.safety.status !== "safe") {
    return { state, result: { status: "rejected", reason: "Unsafe proposal cannot be approved." } };
  }

  if (state.proposal.expiresAtMs < nowEpochMs) {
    return { state, result: { status: "rejected", reason: "Proposal expired; create a fresh plan before approval." } };
  }
  if (state.proposal.plannedWorldRevision !== state.worldRevision) {
    return { state, result: { status: "rejected", reason: "Warehouse state changed after planning; create a fresh proposal." } };
  }
  const refreshed = planTransport(state, {
    palletId: state.proposal.palletId,
    destinationId: state.proposal.destinationId,
    agvId: state.proposal.recommendedAgvId,
  });
  if (refreshed.status !== "plan_available" || createPlanFingerprint(refreshed.plan, state.worldRevision) !== state.proposal.planFingerprint) {
    return { state, result: { status: "rejected", reason: "Proposal no longer matches the current safe plan." } };
  }

  const proposal = { ...state.proposal, status: "approved" as const };
  const approvedWorldRevision = state.worldRevision + 1;
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
    originalDistanceMeters: proposal.distanceMeters,
    travelledDistanceMeters: 0,
    remainingDistanceMeters: proposal.distanceMeters,
    actualDistanceMeters: 0,
    projectedTotalDistanceMeters: proposal.distanceMeters,
    projectedBatteryAfter: proposal.estimatedBatteryAfter,
    approvedWorldRevision,
    replanCount: 0,
    recoveryAuthorized: false,
    recoveryCompleted: false,
  };
  return {
    state: {
      ...state,
      proposal,
      mission,
      worldRevision: approvedWorldRevision,
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
      metrics: { ...state.metrics, operatorRejections: state.metrics.operatorRejections + 1 },
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
      worldRevision: state.worldRevision + 1,
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
  const travelledDistanceMeters = Number((mission.travelledDistanceMeters + distanceDelta).toFixed(1));
  const remainingDistanceMeters = Number(Math.max(0, mission.remainingDistanceMeters - distanceDelta).toFixed(1));
  const physicalProgressPercent = Math.min(100, Math.round((travelledDistanceMeters / mission.projectedTotalDistanceMeters) * 100));
  const movedState: HeroScenarioState = {
    ...state,
    worldRevision: state.worldRevision + 1,
    mission: {
      ...mission,
      routeIndex: nextIndex,
      progressPercent: Number.isFinite(physicalProgressPercent) ? physicalProgressPercent : progressPercent,
      travelledDistanceMeters,
      actualDistanceMeters: travelledDistanceMeters,
      remainingDistanceMeters,
    },
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
        telemetry: {
          ...movedState.telemetry,
          faultState: "aisle_blockage",
          trace: [...movedState.telemetry.trace, "AISLE_BLOCKED N07-N09"],
        },
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
  const attemptedState = {
    ...state,
    metrics: { ...state.metrics, replanAttempts: state.metrics.replanAttempts + 1 },
  };
  const mission = attemptedState.mission;
  if (!mission || mission.id !== missionId) return { state: attemptedState, result: { status: "rejected", reason: `Mission ${missionId} does not exist.` } };
  if (mission.status !== "blocked") return { state: attemptedState, result: { status: "rejected", reason: `Mission ${missionId} is not blocked.` } };
  if (!attemptedState.proposal || attemptedState.proposal.status !== "approved") return { state: attemptedState, result: { status: "rejected", reason: "Recovery has no approved proposal envelope." } };
  if (attemptedState.proposal.destinationId !== mission.destinationId) return { state: attemptedState, result: { status: "rejected", reason: "Recovery may not change the approved destination." } };
  const assignedAgv = attemptedState.fleet.find((agv) => agv.id === mission.agvId);
  if (assignedAgv?.currentTaskId !== mission.id || assignedAgv.status !== "blocked") return { state: attemptedState, result: { status: "rejected", reason: "Mission no longer owns the blocked AGV resource." } };
  if (attemptedState.pallet.status !== "in_transit" || attemptedState.pallet.id !== mission.palletId) return { state: attemptedState, result: { status: "rejected", reason: "Mission no longer owns the in-transit pallet." } };
  if (!attemptedState.nodes.some((node) => node.id === mission.destinationId)) return { state: attemptedState, result: { status: "rejected", reason: "Approved destination no longer exists." } };

  const currentNode = mission.route[mission.routeIndex];
  const previousRoute = mission.route.slice(mission.routeIndex);
  const route = findShortestPath(attemptedState.nodes, attemptedState.edges, currentNode, mission.destinationId);
  if (!route.found) return { state: attemptedState, result: { status: "rejected", reason: "No safe recovery route exists." } };

  const projectedTotalDistanceMeters = Number((mission.travelledDistanceMeters + route.distanceMeters).toFixed(1));
  const additionalDistanceMeters = Number((projectedTotalDistanceMeters - mission.originalDistanceMeters).toFixed(1));
  const selectedAgv = attemptedState.fleet.find((agv) => agv.id === mission.agvId);
  const projectedBatteryAfter = (selectedAgv?.batteryPercent ?? 0) - Math.ceil(projectedTotalDistanceMeters / 6);
  if (additionalDistanceMeters > (attemptedState.proposal?.recoveryPolicy.maxAdditionalDistanceMeters ?? 0)) {
    return { state: attemptedState, result: { status: "rejected", reason: `Recovery adds ${additionalDistanceMeters.toFixed(1)} m, outside the approved recovery envelope.` } };
  }
  if (projectedBatteryAfter < (attemptedState.proposal?.recoveryPolicy.minBatteryPercent ?? attemptedState.safetyReservePercent)) {
    return { state: attemptedState, result: { status: "rejected", reason: `Recovery would leave ${projectedBatteryAfter}% battery, below the approved reserve.` } };
  }
  return {
    state: {
      ...attemptedState,
      worldRevision: attemptedState.worldRevision + 1,
      mission: {
        ...mission,
        status: "replanning",
        previousRoute,
        route: route.path,
        routeIndex: 0,
        progressPercent: Math.round((mission.travelledDistanceMeters / projectedTotalDistanceMeters) * 100),
        distanceMeters: projectedTotalDistanceMeters,
        remainingDistanceMeters: route.distanceMeters,
        projectedTotalDistanceMeters,
        projectedBatteryAfter,
        replanCount: mission.replanCount + 1,
        recoveryAuthorized: true,
      },
      fleet: updateAgv(attemptedState, mission.agvId, { status: "waiting" }),
      decisionPipeline: { ...attemptedState.decisionPipeline, RECOVER: "active" },
      telemetry: { ...attemptedState.telemetry, replans: attemptedState.telemetry.replans + 1, trace: [...attemptedState.telemetry.trace, "REPLAN N07-N08-N11-RACK-A12"] },
    },
    result: { status: "route_updated", previousRoute, newRoute: route.path, additionalDistanceMeters },
  };
}

export function resumeReplannedMission(state: HeroScenarioState): EngineTransition<{ status: "running" | "ignored" }> {
  if (!state.mission || state.mission.status !== "replanning" || !state.mission.recoveryAuthorized) return { state, result: { status: "ignored" } };
  return {
    state: {
      ...state,
      worldRevision: state.worldRevision + 1,
      mission: { ...state.mission, status: "running" },
      fleet: updateAgv(state, state.mission.agvId, { status: "moving" }),
      decisionPipeline: { ...state.decisionPipeline, EXECUTE: "active", RECOVER: "active" },
    },
    result: { status: "running" },
  };
}

function completeMission(state: HeroScenarioState): EngineTransition<{ status: "completed"; nodeId: NodeId }> {
  const mission = state.mission!;
  const battery = mission.projectedBatteryAfter;
  const recovered = mission.replanCount > 0 && !mission.recoveryCompleted;
  return {
    state: {
      ...state,
      worldRevision: state.worldRevision + 1,
      mission: { ...mission, status: "completed", routeIndex: mission.route.length - 1, progressPercent: 100, remainingDistanceMeters: 0, actualDistanceMeters: mission.travelledDistanceMeters, recoveryCompleted: recovered || mission.recoveryCompleted },
      pallet: { ...state.pallet, status: "stored", nodeId: mission.destinationId },
      fleet: updateAgv(state, mission.agvId, { status: "idle", nodeId: mission.destinationId, batteryPercent: battery, currentTaskId: null }),
      decisionPipeline: { ...state.decisionPipeline, EXECUTE: "complete", RECOVER: state.blockageInjected ? "complete" : state.decisionPipeline.RECOVER },
      metrics: { ...state.metrics, completedMissions: state.metrics.completedMissions + 1, successfulReplans: state.metrics.successfulReplans + (recovered ? 1 : 0) },
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
    originalDistanceMeters: state.mission.originalDistanceMeters,
    travelledDistanceMeters: state.mission.travelledDistanceMeters,
    remainingDistanceMeters: state.mission.remainingDistanceMeters,
    projectedTotalDistanceMeters: state.mission.projectedTotalDistanceMeters,
    projectedBatteryAfter: state.mission.projectedBatteryAfter,
    recoveryAuthorized: state.mission.recoveryAuthorized,
    blockedEdge: state.mission.status === "blocked" ? `${HERO_BLOCKED_EDGE[0]}-${HERO_BLOCKED_EDGE[1]}` : null,
  };
}

export function getOperationMetrics(state: HeroScenarioState) {
  const missionSuccessRate = state.metrics.transportAttempts === 0 ? null : state.metrics.completedMissions / state.metrics.transportAttempts;
  const blockedRouteRecoveryRate = state.metrics.replanAttempts === 0 ? null : state.metrics.successfulReplans / state.metrics.replanAttempts;
  const unsafeRequestRejectionRate = state.metrics.unsafeRequests === 0 ? null : state.metrics.unsafeRejections / state.metrics.unsafeRequests;
  return {
    ...state.metrics,
    missionSuccessRate,
    blockedRouteRecoveryRate,
    unsafeRequestRejectionRate,
    averageToolLatencyMs: state.metrics.toolCalls === 0 ? 0 : state.metrics.totalToolLatencyMs / state.metrics.toolCalls,
    routeLengthMeters: state.mission
      ? (state.mission.status === "completed" ? state.mission.actualDistanceMeters : state.mission.projectedTotalDistanceMeters)
      : state.proposal?.distanceMeters ?? 0,
    originalRouteLengthMeters: state.mission?.originalDistanceMeters ?? state.proposal?.distanceMeters ?? 0,
    actualDistanceMeters: state.mission?.actualDistanceMeters ?? 0,
    remainingRouteLengthMeters: state.mission?.remainingDistanceMeters ?? state.proposal?.distanceMeters ?? 0,
    projectedTotalDistanceMeters: state.mission?.projectedTotalDistanceMeters ?? state.proposal?.distanceMeters ?? 0,
    selectedAgv: state.mission?.agvId ?? state.proposal?.recommendedAgvId ?? null,
    planningTotalMs: state.planningTrace?.totalPlanningMs ?? 0,
    benchmark: state.benchmark,
  };
}
