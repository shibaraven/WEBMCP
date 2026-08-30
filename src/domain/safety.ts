import type { Agv, AgvId, HeroScenarioState, NodeId, RouteResult, SafetyCheck, SafetyResult, WarehouseEdge } from "./types";

export interface SafetyContext {
  palletId: string;
  destinationId: string;
  agv: Agv | null;
  route: RouteResult | null;
  estimatedBatteryAfter: number | null;
}

function resultFromChecks(checks: SafetyCheck[]): SafetyResult {
  const failure = checks.find((check) => !check.passed);
  return { status: failure ? "rejected" : "safe", checks, reason: failure?.reason ?? null };
}

function edgeMatches(edge: Pick<WarehouseEdge, "from" | "to">, from: NodeId, to: NodeId): boolean {
  return (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
}

function routeContainsBlockedEdge(state: HeroScenarioState, route: RouteResult | null): boolean {
  if (!route?.found) return false;
  return route.path.some((nodeId, index) => {
    const next = route.path[index + 1];
    if (!next) return false;
    return state.edges.some((edge) => {
      return edgeMatches(edge, nodeId, next) && edge.blocked;
    });
  });
}

export function routeContainsForeignReservation(
  state: HeroScenarioState,
  route: RouteResult | null,
  agvId: AgvId | null,
): boolean {
  if (!route?.found) return false;
  return route.path.some((nodeId, index) => {
    const next = route.path[index + 1];
    if (!next) return false;
    return state.trafficReservations.some((reservation) =>
      reservation.reservedByAgvId !== agvId && edgeMatches(reservation, nodeId, next),
    );
  });
}

export function navigableEdgesForAgv(state: HeroScenarioState, agvId: AgvId | null): WarehouseEdge[] {
  return state.edges.map((edge) => {
    const reservedByAnother = state.trafficReservations.some((reservation) =>
      reservation.edgeId === edge.id && reservation.reservedByAgvId !== agvId,
    );
    return reservedByAnother ? { ...edge, blocked: true } : edge;
  });
}

export function validateTransportPlan(state: HeroScenarioState, context: SafetyContext): SafetyResult {
  const palletExists = context.palletId === state.pallet.id;
  const destination = state.nodes.find((node) => node.id === context.destinationId);
  const palletTransportable = palletExists && state.pallet.status === "waiting";
  const destinationOccupied = Boolean(destination && state.pallet.nodeId === destination.id && state.pallet.status === "stored");
  const agvAvailable = Boolean(context.agv && context.agv.status === "idle" && context.agv.currentTaskId === null);
  const heartbeatHealthy = context.agv?.heartbeatStatus === "online";
  const batterySafe = context.estimatedBatteryAfter !== null && context.estimatedBatteryAfter >= state.safetyReservePercent;
  const routeAvailable = Boolean(context.route?.found);
  const routeClear = routeAvailable && !routeContainsBlockedEdge(state, context.route);
  const reservationClear = !routeAvailable || !routeContainsForeignReservation(state, context.route, context.agv?.id ?? null);
  const activeMission = Boolean(state.mission && !["completed", "failed"].includes(state.mission.status));

  return resultFromChecks([
    { id: "SAFE-01", label: "Destination exists", passed: Boolean(destination), reason: `Destination ${context.destinationId} does not exist.` },
    { id: "SAFE-02", label: "Source pallet exists", passed: palletExists, reason: `Pallet ${context.palletId} does not exist.` },
    { id: "SAFE-03", label: "Pallet is transportable", passed: palletTransportable, reason: `Pallet ${context.palletId} is not waiting for transport.` },
    { id: "SAFE-04", label: "Destination is available", passed: !destinationOccupied, reason: `Destination ${context.destinationId} is already occupied.` },
    { id: "SAFE-05", label: "Selected AGV is available", passed: agvAvailable, reason: `${context.agv?.id ?? "Selected AGV"} is not available.` },
    { id: "SAFE-06", label: "Battery reserve remains above 20%", passed: batterySafe, reason: `${context.agv?.id ?? "Selected AGV"} would fall below the 20% battery safety reserve.` },
    { id: "SAFE-07", label: "Route exists and excludes blocked edges", passed: routeClear, reason: routeAvailable ? "The proposed route contains a blocked edge." : `No route is available to ${context.destinationId}.` },
    { id: "SAFE-08", label: "AGV has no competing mission", passed: !activeMission, reason: "An active mission already owns the transport resource." },
    { id: "SAFE-11", label: "AGV heartbeat is online", passed: heartbeatHealthy, reason: `${context.agv?.id ?? "Selected AGV"} is unavailable because its communication heartbeat expired.` },
    { id: "SAFE-12", label: "Route excludes foreign reservations", passed: reservationClear, reason: "The proposed route enters a segment reserved by another AGV." },
  ]);
}

export function validateMissionStart(state: HeroScenarioState): SafetyResult {
  const mission = state.mission;
  const selectedAgv = state.fleet.find((agv) => agv.id === mission?.agvId);
  const destinationExists = state.nodes.some((node) => node.id === mission?.destinationId);
  const route: RouteResult | null = mission ? {
    found: mission.route.length > 1,
    path: mission.route,
    distanceMeters: mission.remainingDistanceMeters,
    visitedNodeCount: mission.route.length,
  } : null;
  const heartbeatHealthy = selectedAgv?.heartbeatStatus === "online";
  const reservationClear = !route?.found || !routeContainsForeignReservation(state, route, mission?.agvId ?? null);
  return resultFromChecks([
    { id: "START-01", label: "Mission exists", passed: Boolean(mission), reason: "No mission exists." },
    { id: "SAFE-09", label: "Proposal was approved", passed: state.proposal?.status === "approved", reason: "Mission may not start before human approval." },
    { id: "START-03", label: "Mission is approved", passed: mission?.status === "approved", reason: "Mission is not in the approved state." },
    { id: "START-04", label: "Proposal is safe", passed: state.proposal?.safety.status === "safe", reason: "Rejected proposal cannot start a mission." },
    { id: "START-05", label: "Approved world is unchanged", passed: mission?.approvedWorldRevision === state.worldRevision, reason: "Warehouse state changed after approval; a fresh proposal is required." },
    { id: "START-06", label: "Destination still exists", passed: destinationExists, reason: "Approved destination no longer exists." },
    { id: "SAFE-10", label: "Approved active route remains valid", passed: Boolean(route?.found) && !routeContainsBlockedEdge(state, route), reason: "Approved route is no longer clear." },
    { id: "START-08", label: "AGV reservation is owned", passed: selectedAgv?.status === "waiting" && selectedAgv.currentTaskId === mission?.id, reason: "Approved AGV reservation is no longer owned by this mission." },
    { id: "START-09", label: "Pallet reservation is owned", passed: state.pallet.status === "reserved" && state.pallet.id === mission?.palletId, reason: "Pallet reservation is no longer valid." },
    { id: "START-10", label: "Battery reserve is valid", passed: (mission?.projectedBatteryAfter ?? -1) >= state.safetyReservePercent, reason: "Projected battery is below the safety reserve." },
    { id: "SAFE-11", label: "AGV heartbeat remains online", passed: heartbeatHealthy, reason: `${selectedAgv?.id ?? "Selected AGV"} is unavailable because its communication heartbeat expired.` },
    { id: "SAFE-12", label: "Approved route has no foreign reservation", passed: reservationClear, reason: "Approved route enters a segment reserved by another AGV." },
  ]);
}
