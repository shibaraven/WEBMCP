import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHeroE2E } from "../../src/domain/e2e";
import { createHeroState } from "../../src/domain/heroSeed";
import { WEBMCP_TOOL_NAMES } from "../../src/webmcp/tools";
import type { WebMcpTraceEntry } from "../../src/domain/types";

function entry(id: number, toolName: string, missionStatus: WebMcpTraceEntry["missionStatus"], runId: string): WebMcpTraceEntry {
  return { id, toolName, status: "success", summary: "ok", latencyMs: 1, timestamp: new Date(id).toISOString(), source: "webmcp", runId, inputSummary: "{}", missionStatus };
}

test("Live E2E verifies only ordered seven-tool WebMCP evidence with post-completion metrics", () => {
  const state = createHeroState("HERO-001-E2E");
  state.mission = { id: "M-001", palletId: "P-104", sourceId: "INBOUND-01", destinationId: "RACK-A12", agvId: "AGV-03", route: ["N07", "N08", "N11", "RACK-A12"], previousRoute: null, routeIndex: 3, status: "completed", progressPercent: 100, distanceMeters: 49.4, originalDistanceMeters: 41.6, travelledDistanceMeters: 49.4, remainingDistanceMeters: 0, actualDistanceMeters: 49.4, projectedTotalDistanceMeters: 49.4, projectedBatteryAfter: 77, approvedWorldRevision: 1, replanCount: 1, recoveryAuthorized: true, recoveryCompleted: true };
  state.webMcpTrace = WEBMCP_TOOL_NAMES.map((name, index) => entry(index + 1, name, name === "get_operation_metrics" ? "completed" : (index < 4 ? "none" : "blocked"), state.runId)).reverse();
  assert.equal(evaluateHeroE2E(state, 7).verified, true);
});

test("manual, wrong-run and out-of-order evidence cannot produce VERIFIED", () => {
  const state = createHeroState("HERO-001-CURRENT");
  state.webMcpTrace = WEBMCP_TOOL_NAMES.map((name, index) => entry(index + 1, name, "completed", "HERO-001-OLD")).reverse();
  state.webMcpTrace[0] = { ...state.webMcpTrace[0], runId: state.runId, source: "manual" };
  const proof = evaluateHeroE2E(state, 7);
  assert.equal(proof.invokedCount, 0);
  assert.equal(proof.verified, false);
});
