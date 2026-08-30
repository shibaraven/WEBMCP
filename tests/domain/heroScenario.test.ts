import assert from "node:assert/strict";
import test from "node:test";
import { findShortestPath } from "../../src/domain/dijkstra";
import { blockHeroEdge, calculateHeroRoute, resetHeroScenario, setRouteEdgeBlocked, verifyHeroContract } from "../../src/domain/heroScenario";
import { createHeroState, HERO_ALTERNATE_ROUTE, HERO_GOLDEN_ROUTE } from "../../src/domain/heroSeed";
import type { WarehouseEdge, WarehouseNode } from "../../src/domain/types";

test("HERO-001 seed satisfies every contract check", () => {
  assert.ok(verifyHeroContract(createHeroState()).every((check) => check.passed));
});

test("seed creation is byte-for-byte deterministic", () => {
  assert.equal(JSON.stringify(createHeroState()), JSON.stringify(createHeroState()));
  assert.deepEqual(createHeroState(), createHeroState());
});

test("seed instances have no shared mutable references", () => {
  const first = createHeroState();
  const second = createHeroState();
  first.nodes[0].label = "mutated";
  first.edges[0].blocked = true;
  first.fleet[2].batteryPercent = 1;
  first.telemetry.trace.push("mutation");
  assert.deepEqual(second, createHeroState());
});

test("Dijkstra returns the 41.6m golden route", () => {
  const result = calculateHeroRoute(createHeroState());
  assert.equal(result.found, true);
  assert.deepEqual(result.path, [...HERO_GOLDEN_ROUTE]);
  assert.equal(result.distanceMeters, 41.6);
});

test("blocking N07-N09 selects the deterministic 49.4m alternate", () => {
  const result = calculateHeroRoute(blockHeroEdge(createHeroState()));
  assert.equal(result.found, true);
  assert.deepEqual(result.path, [...HERO_ALTERNATE_ROUTE]);
  assert.equal(result.distanceMeters, 49.4);
});

test("Dijkstra reports an unreachable destination", () => {
  const state = setRouteEdgeBlocked(blockHeroEdge(createHeroState()), "N07", "N08", true);
  const result = calculateHeroRoute(state);
  assert.equal(result.found, false);
  assert.deepEqual(result.path, []);
  assert.equal(result.distanceMeters, Infinity);
});

test("equal-cost routes use stable lexical tie-breaking", () => {
  const nodes: WarehouseNode[] = [
    { id: "INBOUND-01", label: "S", kind: "inbound", x: 0, y: 0 },
    { id: "N07", label: "A", kind: "junction", x: 0, y: 0 },
    { id: "N08", label: "B", kind: "junction", x: 0, y: 0 },
    { id: "RACK-A12", label: "D", kind: "rack", x: 0, y: 0 },
  ];
  const edges: WarehouseEdge[] = [
    { id: "B1", from: "INBOUND-01", to: "N08", distanceMeters: 1, blocked: false },
    { id: "B2", from: "N08", to: "RACK-A12", distanceMeters: 1, blocked: false },
    { id: "A1", from: "INBOUND-01", to: "N07", distanceMeters: 1, blocked: false },
    { id: "A2", from: "N07", to: "RACK-A12", distanceMeters: 1, blocked: false },
  ];
  assert.deepEqual(findShortestPath(nodes, edges, "INBOUND-01", "RACK-A12").path, ["INBOUND-01", "N07", "RACK-A12"]);
});

test("Dijkstra rejects negative edge weights", () => {
  const state = createHeroState();
  state.edges[0].distanceMeters = -1;
  assert.throws(() => calculateHeroRoute(state), /Invalid edge weight/);
});

test("Reset recovers the pristine seed after arbitrary mutation", () => {
  const changed = blockHeroEdge(createHeroState());
  changed.pallet.status = "stored";
  changed.fleet[2].batteryPercent = 3;
  changed.telemetry.trace.push("operator-event");
  const reset = resetHeroScenario();
  assert.deepEqual(reset, createHeroState());
  assert.notStrictEqual(reset, changed);
  assert.notStrictEqual(reset.nodes, changed.nodes);
  assert.notStrictEqual(reset.telemetry.trace, changed.telemetry.trace);
});

test("edge updates are immutable and missing edges fail fast", () => {
  const original = createHeroState();
  const updated = blockHeroEdge(original);
  assert.equal(original.edges.find((edge) => edge.id === "E-07-09")?.blocked, false);
  assert.equal(updated.edges.find((edge) => edge.id === "E-07-09")?.blocked, true);
  assert.notStrictEqual(updated.edges, original.edges);
  assert.throws(() => setRouteEdgeBlocked(original, "N01", "RACK-A12", true), /missing edge/);
});
