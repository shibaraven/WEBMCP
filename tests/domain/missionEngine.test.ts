import assert from "node:assert/strict";
import test from "node:test";
import { HERO_ALTERNATE_ROUTE, HERO_GOLDEN_ROUTE, createHeroState } from "../../src/domain/heroSeed";
import {
  advanceMission,
  approveTransportProposal,
  beginMissionReplan,
  createTransportProposal,
  rejectTransportProposal,
  resumeReplannedMission,
  runTransportPlan,
  startApprovedMission,
} from "../../src/domain/missionEngine";
import { resetHeroScenario } from "../../src/domain/heroScenario";
import { validateTransportPlan } from "../../src/domain/safety";
import { findShortestPath } from "../../src/domain/dijkstra";

test("safe proposal selects AGV-03 and waits for human approval", () => {
  const transition = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" });
  assert.equal(transition.result.status, "approval_required");
  assert.equal(transition.state.proposal?.recommendedAgvId, "AGV-03");
  assert.equal(transition.state.proposal?.status, "waiting");
  assert.deepEqual(transition.state.proposal?.plannedRoute, [...HERO_GOLDEN_ROUTE]);
  assert.equal(transition.state.proposal?.estimatedBatteryAfter, 79);
  assert.equal(transition.state.mission, null);
});

test("mission cannot start before approval", () => {
  const proposed = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  const start = startApprovedMission(proposed);
  assert.equal(start.result.status, "rejected");
  assert.equal(start.state.lastSafetyResult?.checks.find((check) => check.id === "START-02")?.passed, false);
  assert.equal(start.state.mission, null);
});

test("human approval creates an approved mission and start transitions to running", () => {
  const proposed = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  const approved = approveTransportProposal(proposed);
  assert.equal(approved.result.status, "approved");
  assert.equal(approved.state.mission?.status, "approved");
  assert.equal(approved.state.proposal?.status, "approved");
  const running = startApprovedMission(approved.state);
  assert.equal(running.result.status, "running");
  assert.equal(running.state.mission?.status, "running");
  assert.equal(running.state.pallet.status, "in_transit");
});

test("human rejection never creates a mission", () => {
  const proposed = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  const rejected = rejectTransportProposal(proposed);
  assert.equal(rejected.state.proposal?.status, "rejected");
  assert.equal(rejected.state.mission, null);
  assert.equal(startApprovedMission(rejected.state).result.status, "rejected");
});

test("invalid destination is rejected by deterministic safety", () => {
  const result = runTransportPlan(createHeroState(), { palletId: "P-104", destinationId: "RACK-Z99" });
  assert.equal(result.result.status, "rejected");
  if (result.result.status === "rejected") assert.equal(result.result.reason, "Destination RACK-Z99 does not exist.");
});

test("low-battery AGV-04 is rejected below the 20% reserve", () => {
  const result = runTransportPlan(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12", agvId: "AGV-04" });
  assert.equal(result.result.status, "rejected");
  if (result.result.status === "rejected") assert.match(result.result.reason, /below the 20% battery safety reserve/);
});

test("safety rejects a route that contains a blocked edge", () => {
  const state = createHeroState();
  state.edges.find((edge) => edge.id === "E-07-09")!.blocked = true;
  const route = { found: true, path: [...HERO_GOLDEN_ROUTE], distanceMeters: 41.6, visitedNodeCount: 5 };
  const agv = state.fleet.find((item) => item.id === "AGV-03")!;
  const safety = validateTransportPlan(state, { palletId: "P-104", destinationId: "RACK-A12", agv, route, estimatedBatteryAfter: 79 });
  assert.equal(safety.status, "rejected");
  assert.equal(safety.checks.find((check) => check.id === "SAFE-08")?.passed, false);
});

test("simulator stops AGV-03 at N07 and marks N07-N09 blocked", () => {
  let state = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  state = approveTransportProposal(state).state;
  state = startApprovedMission(state).state;
  state = advanceMission(state).state;
  const blocked = advanceMission(state).state;
  assert.equal(blocked.mission?.status, "blocked");
  assert.equal(blocked.mission?.routeIndex, 2);
  assert.equal(blocked.fleet.find((agv) => agv.id === "AGV-03")?.nodeId, "N07");
  assert.equal(blocked.fleet.find((agv) => agv.id === "AGV-03")?.status, "blocked");
  assert.equal(blocked.edges.find((edge) => edge.id === "E-07-09")?.blocked, true);
});

test("blocked mission replans through N08 and N11 with 7.8m extra distance", () => {
  let state = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  state = startApprovedMission(approveTransportProposal(state).state).state;
  state = advanceMission(advanceMission(state).state).state;
  const replanned = beginMissionReplan(state, "M-001");
  assert.equal(replanned.result.status, "route_updated");
  if (replanned.result.status === "route_updated") {
    assert.deepEqual(replanned.result.newRoute, ["N07", "N08", "N11", "RACK-A12"]);
    assert.equal(replanned.result.additionalDistanceMeters, 7.8);
  }
  assert.equal(replanned.state.mission?.status, "replanning");
});

test("full approved mission recovers and delivers P-104 to RACK-A12", () => {
  let state = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  state = startApprovedMission(approveTransportProposal(state).state).state;
  state = advanceMission(state).state;
  state = advanceMission(state).state;
  state = beginMissionReplan(state, "M-001").state;
  assert.deepEqual(state.mission?.route, HERO_ALTERNATE_ROUTE.slice(2));
  state = resumeReplannedMission(state).state;
  state = advanceMission(state).state;
  state = advanceMission(state).state;
  state = advanceMission(state).state;
  assert.equal(state.mission?.status, "completed");
  assert.equal(state.pallet.status, "stored");
  assert.equal(state.pallet.nodeId, "RACK-A12");
  assert.equal(state.fleet.find((agv) => agv.id === "AGV-03")?.status, "idle");
  assert.equal(state.metrics.completedMissions, 1);
  assert.equal(state.metrics.successfulReplans, 1);
});

test("replanning is rejected unless the mission is blocked", () => {
  let state = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  state = startApprovedMission(approveTransportProposal(state).state).state;
  assert.equal(beginMissionReplan(state, "M-001").result.status, "rejected");
});

test("complete reset clears proposal, mission, blockage, metrics and traces", () => {
  let state = createTransportProposal(createHeroState(), { palletId: "P-104", destinationId: "RACK-A12" }).state;
  state = startApprovedMission(approveTransportProposal(state).state).state;
  state = advanceMission(advanceMission(state).state).state;
  state.webMcpTrace.push({ id: 1, toolName: "test", status: "success", summary: "test", latencyMs: 1, timestamp: "now" });
  const reset = resetHeroScenario();
  assert.deepEqual(reset, createHeroState());
  assert.equal(reset.mission, null);
  assert.equal(reset.proposal, null);
  assert.equal(reset.webMcpTrace.length, 0);
  assert.equal(reset.metrics.toolCalls, 0);
  assert.equal(reset.edges.some((edge) => edge.blocked), false);
});

test("Dijkstra still finds alternate route in the blocked live graph", () => {
  const state = createHeroState();
  state.edges.find((edge) => edge.id === "E-07-09")!.blocked = true;
  const route = findShortestPath(state.nodes, state.edges, "INBOUND-01", "RACK-A12");
  assert.deepEqual(route.path, [...HERO_ALTERNATE_ROUTE]);
  assert.equal(route.distanceMeters, 49.4);
});
