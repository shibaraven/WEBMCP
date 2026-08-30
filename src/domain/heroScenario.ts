import { findShortestPath } from "./dijkstra";
import { createHeroState, HERO_BLOCKED_EDGE, HERO_DESTINATION, HERO_SOURCE } from "./heroSeed";
import type { HeroScenarioState, NodeId, RouteResult } from "./types";

export function calculateHeroRoute(state: HeroScenarioState): RouteResult {
  return findShortestPath(state.nodes, state.edges, HERO_SOURCE, HERO_DESTINATION);
}

export function setRouteEdgeBlocked(state: HeroScenarioState, from: NodeId, to: NodeId, blocked: boolean): HeroScenarioState {
  let found = false;
  const edges = state.edges.map((edge) => {
    const matches = (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
    if (!matches) return edge;
    found = true;
    return { ...edge, blocked };
  });
  if (!found) throw new Error(`Cannot update missing edge: ${from} <-> ${to}`);
  return { ...state, edges };
}

export function blockHeroEdge(state: HeroScenarioState): HeroScenarioState {
  return setRouteEdgeBlocked(state, HERO_BLOCKED_EDGE[0], HERO_BLOCKED_EDGE[1], true);
}

export function resetHeroScenario(): HeroScenarioState {
  return createHeroState();
}

export function verifyHeroContract(state: HeroScenarioState): Array<{ label: string; passed: boolean }> {
  const preferredAgv = state.fleet.find((agv) => agv.id === state.preferredAgvId);
  return [
    { label: "Scenario is HERO-001", passed: state.scenarioId === "HERO-001" },
    { label: "P-104 is waiting at inbound", passed: state.pallet.id === "P-104" && state.pallet.nodeId === "INBOUND-01" },
    { label: "Destination is RACK-A12", passed: state.pallet.destinationNodeId === "RACK-A12" },
    { label: "Preferred AGV is AGV-03", passed: state.preferredAgvId === "AGV-03" },
    { label: "AGV-03 begins at 86%", passed: preferredAgv?.batteryPercent === 86 },
    { label: "Safety reserve is 20%", passed: state.safetyReservePercent === 20 },
    { label: "Fleet contains four AGVs", passed: state.fleet.length === 4 },
    { label: "Telemetry begins deterministically", passed: state.telemetry.scenarioClockMs === 0 },
  ];
}
