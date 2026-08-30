import type { HeroScenarioState, WebMcpTraceEntry } from "./types";
import { WEBMCP_TOOL_NAMES } from "../webmcp/tools";

export const HERO_WEBMCP_SEQUENCE = [...WEBMCP_TOOL_NAMES] as const;

export function isOrderedSubsequence(actual: string[], expected: readonly string[]): boolean {
  let cursor = 0;
  for (const name of actual) {
    if (name === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return expected.length === 0;
}

export function currentRunWebMcpTrace(state: HeroScenarioState): WebMcpTraceEntry[] {
  return state.webMcpTrace
    .filter((entry) => entry.source === "webmcp" && entry.runId === state.runId)
    .slice()
    .reverse();
}

export function evaluateHeroE2E(state: HeroScenarioState, discoveredCount: number) {
  const trace = currentRunWebMcpTrace(state);
  const names = trace.map((entry) => entry.toolName);
  const invokedCount = new Set(names.filter((name) => WEBMCP_TOOL_NAMES.includes(name as (typeof WEBMCP_TOOL_NAMES)[number]))).size;
  const orderedSequence = isOrderedSubsequence(names, HERO_WEBMCP_SEQUENCE);
  const metricsAfterCompletion = trace.some((entry) => entry.toolName === "get_operation_metrics" && entry.missionStatus === "completed");
  const missionCompleted = state.mission?.status === "completed";
  const discoveryVerified = discoveredCount === WEBMCP_TOOL_NAMES.length;
  return {
    discoveredCount,
    invokedCount,
    discoveryVerified,
    orderedSequence,
    missionCompleted,
    metricsAfterCompletion,
    verified: discoveryVerified && invokedCount === WEBMCP_TOOL_NAMES.length && orderedSequence && missionCompleted && metricsAfterCompletion,
  };
}
