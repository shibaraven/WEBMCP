import assert from "node:assert/strict";
import test from "node:test";
import { advanceManualBenchmark, MANUAL_BENCHMARK_STEPS, prepareAgentBenchmark } from "../../src/domain/benchmark";
import { createHeroState } from "../../src/domain/heroSeed";

test("manual benchmark measures seven real interactions to the proposal boundary", () => {
  let state = createHeroState();
  MANUAL_BENCHMARK_STEPS.forEach((_, index) => {
    state = advanceManualBenchmark(state, 100 + index * 50);
  });
  assert.equal(state.benchmark.manual.status, "completed");
  assert.equal(state.benchmark.manual.humanInteractions, 7);
  assert.equal(state.benchmark.manual.elapsedMs, 300);
  assert.equal(state.proposal?.status, "waiting");
  assert.equal(state.proposal?.recommendedAgvId, "AGV-03");
  assert.equal(state.planningTrace?.result, "safe");
});

test("agent benchmark preparation resets operations but preserves the measured manual result", () => {
  let state = createHeroState();
  MANUAL_BENCHMARK_STEPS.forEach((_, index) => {
    state = advanceManualBenchmark(state, 100 + index * 25);
  });
  state.edges.find((edge) => edge.id === "E-07-09")!.blocked = true;
  state.webMcpTrace.push({ id: 1, toolName: "test", status: "success", summary: "test", latencyMs: 1, timestamp: "now", source: "webmcp", runId: state.runId, inputSummary: "{}", missionStatus: "none" });

  const armed = prepareAgentBenchmark(state);
  assert.equal(armed.benchmark.mode, "agent");
  assert.equal(armed.benchmark.manual.humanInteractions, 7);
  assert.equal(armed.benchmark.agent.status, "idle");
  assert.equal(armed.proposal, null);
  assert.equal(armed.mission, null);
  assert.equal(armed.webMcpTrace.length, 0);
  assert.equal(armed.edges.some((edge) => edge.blocked), false);
  assert.equal(armed.telemetry.pendingTimerCount, 0);
  assert.equal(armed.telemetry.faultState, "none");
});
