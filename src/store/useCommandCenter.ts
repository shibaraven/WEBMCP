"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createHeroState } from "../domain/heroSeed";
import { advanceManualBenchmark, prepareAgentBenchmark } from "../domain/benchmark";
import { isOrderedSubsequence } from "../domain/e2e";
import {
  advanceMission,
  approveTransportProposal,
  beginMissionReplan,
  createTransportProposal,
  getMissionStatus,
  getOperationMetrics,
  getOperationalSnapshot,
  inspectLocation,
  rejectTransportProposal,
  resumeReplannedMission,
  runTransportPlan,
  startApprovedMission,
} from "../domain/missionEngine";
import type { HeroScenarioState, PlanTransportInput, WebMcpTraceEntry } from "../domain/types";
import type { WebMcpCommandExecutor, WebMcpToolName } from "../webmcp/tools";
import { useWebMcpTools } from "../webmcp/useWebMcpTools";

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function summarize(name: WebMcpToolName, output: unknown): string {
  const value = output as Record<string, unknown>;
  if (value.status === "rejected" || value.status === "not_found") return String(value.reason ?? value.status);
  switch (name) {
    case "get_operational_snapshot": return `HERO-001 / ${String((value.waitingPallets as unknown[])?.length ?? 0)} waiting pallet`;
    case "inspect_location": return `${String(value.locationId)} / ${value.occupied ? "occupied" : "clear"}`;
    case "plan_transport": return `${String(value.recommendedAgv)} / ${String(value.distanceM)} m / ${String(value.safety)}`;
    case "propose_transport": return `${String(value.proposalId)} / approval required`;
    case "get_mission_status": return `${String(value.missionId)} / ${String(value.status)}`;
    case "replan_mission": return `${String(value.status)} / +${String(value.additionalDistanceM)} m`;
    case "get_operation_metrics": return `${String(value.toolCalls)} tool calls / ${String(value.completedMissions)} completed`;
  }
}

function traceStatus(output: unknown): WebMcpTraceEntry["status"] {
  const status = (output as Record<string, unknown>)?.status;
  if (status === "rejected" || status === "not_found") return "rejected";
  return "success";
}

export function useCommandCenter() {
  const [state, setState] = useState(createHeroState);
  const [resetCount, setResetCount] = useState(0);
  const [operatorNotice, setOperatorNotice] = useState("Ready for a safe transport proposal.");
  const stateRef = useRef(state);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerGenerationRef = useRef(0);

  const commit = useCallback((next: HeroScenarioState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const executeCommand = useCallback<WebMcpCommandExecutor>((name, input, meta) => {
    const started = nowMs();
    const current = stateRef.current;
    const isWebMcp = meta.source === "webmcp";
    const previousAgent = current.benchmark.agent;
    const benchmarkOpen = isWebMcp && previousAgent.status !== "completed";
    const agentStartedAt = previousAgent.startedAtMs ?? started;
    const working: HeroScenarioState = benchmarkOpen ? {
      ...current,
      benchmark: {
        ...current.benchmark,
        mode: "agent",
        agent: {
          ...previousAgent,
          status: previousAgent.status === "completed" ? "completed" : "running",
          humanIntents: previousAgent.humanIntents || 1,
          startedAtMs: agentStartedAt,
        },
      },
    } : current;
    let next = working;
    let output: unknown;

    switch (name) {
      case "get_operational_snapshot": {
        output = getOperationalSnapshot(working);
        next = { ...working, decisionPipeline: { ...working.decisionPipeline, OBSERVE: "complete" } };
        break;
      }
      case "inspect_location": {
        output = inspectLocation(working, String(input.locationId ?? ""));
        next = { ...working, decisionPipeline: { ...working.decisionPipeline, OBSERVE: "complete" } };
        break;
      }
      case "plan_transport": {
        const transition = runTransportPlan(working, {
          palletId: String(input.palletId ?? ""),
          destinationId: String(input.destinationId ?? ""),
          agvId: typeof input.agvId === "string" ? input.agvId : undefined,
        });
        next = transition.state;
        output = transition.result.status === "plan_available"
          ? {
              status: "plan_available",
              recommendedAgv: transition.result.plan.recommendedAgvId,
              route: transition.result.plan.plannedRoute,
              distanceM: transition.result.plan.distanceMeters,
              estimatedSeconds: transition.result.plan.estimatedSeconds,
              batteryAfter: transition.result.plan.estimatedBatteryAfter,
              safety: transition.result.plan.safety.status,
              planningMs: transition.result.trace.totalPlanningMs,
            }
          : { status: "rejected", reason: transition.result.reason, safety: "rejected" };
        break;
      }
      case "propose_transport": {
        const transition = createTransportProposal(working, {
          palletId: String(input.palletId ?? ""),
          destinationId: String(input.destinationId ?? ""),
          agvId: typeof input.agvId === "string" ? input.agvId : undefined,
        });
        next = transition.state;
        output = transition.result.status === "approval_required"
          ? {
              status: "approval_required",
              proposalId: transition.result.proposal.id,
              message: "Human approval is required before execution.",
              expiresAt: new Date(transition.result.proposal.expiresAtMs).toISOString(),
              recoveryPolicy: transition.result.proposal.recoveryPolicy,
            }
          : transition.result;
        break;
      }
      case "get_mission_status": {
        output = getMissionStatus(working, String(input.missionId ?? ""));
        break;
      }
      case "replan_mission": {
        const transition = beginMissionReplan(working, String(input.missionId ?? ""));
        next = transition.state;
        output = transition.result.status === "route_updated"
          ? {
              status: "route_updated",
              previousRoute: transition.result.previousRoute,
              newRoute: transition.result.newRoute,
              additionalDistanceM: transition.result.additionalDistanceMeters,
              projectedTotalDistanceM: transition.state.mission?.projectedTotalDistanceMeters,
              projectedBatteryAfter: transition.state.mission?.projectedBatteryAfter,
            }
          : transition.result;
        break;
      }
      case "get_operation_metrics": {
        output = { ...getOperationMetrics(working), toolCalls: working.metrics.toolCalls + (isWebMcp ? 1 : 0) };
        break;
      }
    }

    const finished = nowMs();
    const latencyMs = Number(Math.max(0, finished - started).toFixed(3));
    const outputStatus = (output as Record<string, unknown>)?.status;
    const chronologicalNames = [...working.webMcpTrace].reverse().map((item) => item.toolName).concat(name);
    const proposalSequenceVerified = isOrderedSubsequence(chronologicalNames, [
      "get_operational_snapshot",
      "inspect_location",
      "plan_transport",
      "propose_transport",
    ]);
    const proposalReady = benchmarkOpen && name === "propose_transport" && outputStatus === "approval_required" && proposalSequenceVerified;
    const entry: WebMcpTraceEntry = {
      id: current.metrics.toolCalls + 1,
      toolName: name,
      status: traceStatus(output),
      summary: summarize(name, output),
      latencyMs,
      timestamp: new Date().toISOString(),
      source: meta.source,
      runId: current.runId,
      inputSummary: JSON.stringify(input).slice(0, 180),
      missionStatus: next.mission?.status ?? "none",
    };
    if (isWebMcp) {
      next = {
        ...next,
        webMcpTrace: [entry, ...next.webMcpTrace].slice(0, 50),
        metrics: {
          ...next.metrics,
          toolCalls: current.metrics.toolCalls + 1,
          totalToolLatencyMs: Number((current.metrics.totalToolLatencyMs + latencyMs).toFixed(3)),
        },
        benchmark: {
          ...next.benchmark,
          mode: "agent",
          agent: {
            ...next.benchmark.agent,
            status: proposalReady ? "completed" : next.benchmark.agent.status,
            toolCalls: previousAgent.toolCalls + (benchmarkOpen ? 1 : 0),
            humanIntents: previousAgent.humanIntents || 1,
            startedAtMs: agentStartedAt,
            proposalReadyAtMs: proposalReady ? finished : next.benchmark.agent.proposalReadyAtMs,
            elapsedMs: proposalReady ? Number(Math.max(0, finished - agentStartedAt).toFixed(3)) : next.benchmark.agent.elapsedMs,
            toolComputeMs: Number((previousAgent.toolComputeMs + (benchmarkOpen ? latencyMs : 0)).toFixed(3)),
            sequenceVerified: proposalReady || next.benchmark.agent.sequenceVerified,
          },
        },
      };
    }
    commit(next);
    setOperatorNotice(entry.status === "success" ? `${meta.source === "webmcp" ? "WebMCP" : "Manual fallback"}: ${name} completed.` : entry.summary);
    return output;
  }, [commit]);

  const webMcp = useWebMcpTools(executeCommand);

  const propose = useCallback((input: PlanTransportInput = { palletId: "P-104", destinationId: "RACK-A12" }) => {
    return executeCommand("propose_transport", {
      palletId: input.palletId,
      destinationId: input.destinationId,
      ...(input.agvId ? { agvId: input.agvId } : {}),
    }, { source: "manual" });
  }, [executeCommand]);

  const approve = useCallback(() => {
    const transition = approveTransportProposal(stateRef.current);
    const approved = transition.result.status === "approved";
    const next = approved
      ? {
          ...transition.state,
          benchmark: {
            ...transition.state.benchmark,
            agent: {
              ...transition.state.benchmark.agent,
              humanApprovals: transition.state.benchmark.mode === "agent"
                ? transition.state.benchmark.agent.humanApprovals + 1
                : transition.state.benchmark.agent.humanApprovals,
            },
          },
          telemetry: { ...transition.state.telemetry, pendingTimerCount: 1 },
        }
      : transition.state;
    commit(next);
    setOperatorNotice(transition.result.status === "approved" ? "Human approval recorded. Mission will start." : transition.result.reason ?? "Approval rejected.");
  }, [commit]);

  const reject = useCallback(() => {
    const transition = rejectTransportProposal(stateRef.current);
    commit(transition.state);
    setOperatorNotice(transition.result.reason);
  }, [commit]);

  const replan = useCallback(() => {
    const result = executeCommand("replan_mission", { missionId: "M-001" }, { source: "manual" });
    const current = stateRef.current;
    if (current.mission?.status === "replanning") {
      commit({ ...current, telemetry: { ...current.telemetry, pendingTimerCount: 1 } });
    }
    return result;
  }, [commit, executeCommand]);

  const safetyProbe = useCallback((kind: "destination" | "battery") => {
    const input: PlanTransportInput = kind === "destination"
      ? { palletId: "P-104", destinationId: "RACK-Z99" }
      : { palletId: "P-104", destinationId: "RACK-A12", agvId: "AGV-04" };
    return executeCommand("plan_transport", {
      palletId: input.palletId,
      destinationId: input.destinationId,
      ...(input.agvId ? { agvId: input.agvId } : {}),
    }, { source: "manual" });
  }, [executeCommand]);

  const reset = useCallback(() => {
    timerGenerationRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const fresh = createHeroState(`HERO-001-R${Date.now()}`);
    commit(fresh);
    setResetCount((count) => count + 1);
    setOperatorNotice("HERO-001 reset: mission, proposal, trace, metrics, timers and fault state cleared.");
  }, [commit]);

  const manualBenchmarkStep = useCallback(() => {
    const next = advanceManualBenchmark(stateRef.current, nowMs());
    commit(next);
    setOperatorNotice(next.benchmark.manual.lastEvidence);
  }, [commit]);

  const armAgentBenchmark = useCallback(() => {
    timerGenerationRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = prepareAgentBenchmark(stateRef.current);
    commit(next);
    setOperatorNotice("Fresh HERO-001 armed for the WebMCP Agent benchmark. Send one intent now.");
  }, [commit]);

  const missionStatus = state.mission?.status;
  const routeIndex = state.mission?.routeIndex;
  useEffect(() => {
    if (!missionStatus) return;
    const generation = timerGenerationRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (missionStatus === "approved") {
      timer = setTimeout(() => {
        if (generation !== timerGenerationRef.current) return;
        const transition = startApprovedMission(stateRef.current);
        commit({ ...transition.state, telemetry: { ...transition.state.telemetry, pendingTimerCount: transition.result.status === "running" ? 1 : 0 } });
      }, 450);
    } else if (missionStatus === "running") {
      timer = setTimeout(() => {
        if (generation !== timerGenerationRef.current) return;
        const transition = advanceMission(stateRef.current);
        const pendingTimerCount = transition.result.status === "running" ? 1 : 0;
        commit({ ...transition.state, telemetry: { ...transition.state.telemetry, pendingTimerCount } });
        if (transition.result.status === "blocked") setOperatorNotice("Aisle N07-N09 blocked. AGV-03 stopped safely and requires replanning.");
        if (transition.result.status === "completed") setOperatorNotice("Mission completed. P-104 delivered to RACK-A12.");
      }, 850);
    } else if (missionStatus === "replanning") {
      timer = setTimeout(() => {
        if (generation !== timerGenerationRef.current) return;
        const transition = resumeReplannedMission(stateRef.current);
        commit({ ...transition.state, telemetry: { ...transition.state.telemetry, pendingTimerCount: transition.result.status === "running" ? 1 : 0 } });
      }, 500);
    }
    timerRef.current = timer ?? null;
    return () => {
      if (timer) clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [commit, missionStatus, routeIndex]);

  return {
    state,
    webMcp,
    resetCount,
    operatorNotice,
    propose,
    approve,
    reject,
    replan,
    safetyProbe,
    reset,
    manualBenchmarkStep,
    armAgentBenchmark,
    executeCommand,
  };
}
