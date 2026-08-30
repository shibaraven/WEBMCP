"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createHeroState } from "../domain/heroSeed";
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

  const commit = useCallback((next: HeroScenarioState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const executeCommand = useCallback<WebMcpCommandExecutor>((name, input) => {
    const started = nowMs();
    const current = stateRef.current;
    let next = current;
    let output: unknown;

    switch (name) {
      case "get_operational_snapshot": {
        output = getOperationalSnapshot(current);
        next = { ...current, decisionPipeline: { ...current.decisionPipeline, OBSERVE: "complete" } };
        break;
      }
      case "inspect_location": {
        output = inspectLocation(current, String(input.locationId ?? ""));
        next = { ...current, decisionPipeline: { ...current.decisionPipeline, OBSERVE: "complete" } };
        break;
      }
      case "plan_transport": {
        const transition = runTransportPlan(current, {
          palletId: String(input.palletId ?? ""),
          destinationId: String(input.destinationId ?? ""),
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
        const transition = createTransportProposal(current, {
          palletId: String(input.palletId ?? ""),
          destinationId: String(input.destinationId ?? ""),
          agvId: typeof input.agvId === "string" ? input.agvId : undefined,
        });
        next = transition.state;
        output = transition.result.status === "approval_required"
          ? { status: "approval_required", proposalId: transition.result.proposal.id, message: "Human approval is required before execution." }
          : transition.result;
        break;
      }
      case "get_mission_status": {
        output = getMissionStatus(current, String(input.missionId ?? ""));
        break;
      }
      case "replan_mission": {
        const transition = beginMissionReplan(current, String(input.missionId ?? ""));
        next = transition.state;
        output = transition.result.status === "route_updated"
          ? {
              status: "route_updated",
              previousRoute: transition.result.previousRoute,
              newRoute: transition.result.newRoute,
              additionalDistanceM: transition.result.additionalDistanceMeters,
            }
          : transition.result;
        break;
      }
      case "get_operation_metrics": {
        output = { ...getOperationMetrics(current), toolCalls: current.metrics.toolCalls + 1 };
        break;
      }
    }

    const latencyMs = Number(Math.max(0, nowMs() - started).toFixed(3));
    const entry: WebMcpTraceEntry = {
      id: current.metrics.toolCalls + 1,
      toolName: name,
      status: traceStatus(output),
      summary: summarize(name, output),
      latencyMs,
      timestamp: new Date().toISOString(),
    };
    next = {
      ...next,
      webMcpTrace: [entry, ...next.webMcpTrace].slice(0, 30),
      metrics: { ...next.metrics, toolCalls: current.metrics.toolCalls + 1 },
    };
    commit(next);
    setOperatorNotice(entry.status === "success" ? `${name} completed.` : entry.summary);
    return output;
  }, [commit]);

  const webMcp = useWebMcpTools(executeCommand);

  const propose = useCallback((input: PlanTransportInput = { palletId: "P-104", destinationId: "RACK-A12" }) => {
    const transition = createTransportProposal(stateRef.current, input);
    commit(transition.state);
    setOperatorNotice(transition.result.status === "approval_required" ? "TP-001 is waiting for human approval." : transition.result.reason);
    return transition.result;
  }, [commit]);

  const approve = useCallback(() => {
    const transition = approveTransportProposal(stateRef.current);
    commit(transition.state);
    setOperatorNotice(transition.result.status === "approved" ? "Human approval recorded. Mission will start." : transition.result.reason ?? "Approval rejected.");
  }, [commit]);

  const reject = useCallback(() => {
    const transition = rejectTransportProposal(stateRef.current);
    commit(transition.state);
    setOperatorNotice(transition.result.reason);
  }, [commit]);

  const replan = useCallback(() => {
    const transition = beginMissionReplan(stateRef.current, "M-001");
    commit(transition.state);
    setOperatorNotice(transition.result.status === "route_updated" ? "Safe alternate route found. AGV will resume." : transition.result.reason);
  }, [commit]);

  const safetyProbe = useCallback((kind: "destination" | "battery") => {
    const input: PlanTransportInput = kind === "destination"
      ? { palletId: "P-104", destinationId: "RACK-Z99" }
      : { palletId: "P-104", destinationId: "RACK-A12", agvId: "AGV-04" };
    const transition = runTransportPlan(stateRef.current, input);
    commit(transition.state);
    setOperatorNotice(transition.result.status === "rejected" ? transition.result.reason : "Safety probe unexpectedly passed.");
  }, [commit]);

  const reset = useCallback(() => {
    const fresh = createHeroState();
    commit(fresh);
    setResetCount((count) => count + 1);
    setOperatorNotice("HERO-001 reset: mission, proposal, blockage, trace and metrics cleared.");
  }, [commit]);

  const missionStatus = state.mission?.status;
  const routeIndex = state.mission?.routeIndex;
  useEffect(() => {
    if (!missionStatus) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (missionStatus === "approved") {
      timer = setTimeout(() => commit(startApprovedMission(stateRef.current).state), 450);
    } else if (missionStatus === "running") {
      timer = setTimeout(() => {
        const transition = advanceMission(stateRef.current);
        commit(transition.state);
        if (transition.result.status === "blocked") setOperatorNotice("Aisle N07-N09 blocked. AGV-03 stopped safely and requires replanning.");
        if (transition.result.status === "completed") setOperatorNotice("Mission completed. P-104 delivered to RACK-A12.");
      }, 850);
    } else if (missionStatus === "replanning") {
      timer = setTimeout(() => commit(resumeReplannedMission(stateRef.current).state), 500);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [commit, missionStatus, routeIndex]);

  return { state, webMcp, resetCount, operatorNotice, propose, approve, reject, replan, safetyProbe, reset, executeCommand };
}
