import { createHeroState } from "./heroSeed";
import { createTransportProposal, inspectLocation, runTransportPlan } from "./missionEngine";
import type { HeroScenarioState } from "./types";

export const MANUAL_BENCHMARK_STEPS = [
  { id: "select-pallet", label: "Select P-104" },
  { id: "inspect-source", label: "Inspect INBOUND-01" },
  { id: "select-destination", label: "Select RACK-A12" },
  { id: "inspect-fleet", label: "Inspect fleet" },
  { id: "select-agv", label: "Select AGV-03" },
  { id: "review-plan", label: "Review safe route" },
  { id: "create-proposal", label: "Create proposal" },
] as const;

export function advanceManualBenchmark(state: HeroScenarioState, timestampMs: number): HeroScenarioState {
  const current = state.benchmark.manual;
  if (current.status === "completed") return state;

  const stepIndex = current.stepIndex;
  const startedAtMs = current.startedAtMs ?? timestampMs;
  const humanInteractions = current.humanInteractions + 1;
  let next = state;
  let evidence: string = MANUAL_BENCHMARK_STEPS[stepIndex]?.label ?? "Manual benchmark complete";

  switch (stepIndex) {
    case 0:
      evidence = `${state.pallet.id} selected at ${state.pallet.nodeId}`;
      break;
    case 1: {
      const location = inspectLocation(state, "INBOUND-01");
      evidence = `${location.locationId} inspected / P-104 present`;
      break;
    }
    case 2:
      evidence = "RACK-A12 selected as destination";
      break;
    case 3:
      evidence = `${state.fleet.filter((agv) => agv.status === "idle").length} idle AGVs inspected`;
      break;
    case 4:
      evidence = "AGV-03 selected for validation";
      break;
    case 5: {
      const planned = runTransportPlan(state, { palletId: "P-104", destinationId: "RACK-A12", agvId: "AGV-03" });
      next = planned.state;
      evidence = planned.result.status === "plan_available"
        ? `${planned.result.plan.distanceMeters.toFixed(1)} m safe route reviewed`
        : planned.result.reason;
      break;
    }
    case 6: {
      const proposed = createTransportProposal(state, { palletId: "P-104", destinationId: "RACK-A12", agvId: "AGV-03" });
      next = proposed.state;
      evidence = proposed.result.status === "approval_required" ? "TP-001 rendered and ready" : proposed.result.reason;
      break;
    }
  }

  const completed = stepIndex === MANUAL_BENCHMARK_STEPS.length - 1 && next.proposal?.status === "waiting";
  const nextStepIndex = Math.min(stepIndex + 1, MANUAL_BENCHMARK_STEPS.length);
  return {
    ...next,
    benchmark: {
      ...next.benchmark,
      mode: "manual",
      manual: {
        status: completed ? "completed" : "running",
        stepIndex: nextStepIndex,
        humanInteractions,
        startedAtMs,
        proposalReadyAtMs: completed ? timestampMs : null,
        elapsedMs: completed ? Number(Math.max(0, timestampMs - startedAtMs).toFixed(3)) : null,
        lastEvidence: evidence,
      },
    },
  };
}

export function prepareAgentBenchmark(state: HeroScenarioState): HeroScenarioState {
  const fresh = createHeroState();
  return {
    ...fresh,
    benchmark: {
      ...fresh.benchmark,
      mode: "agent",
      manual: state.benchmark.manual,
    },
  };
}
