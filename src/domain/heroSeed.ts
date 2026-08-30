import type { HeroScenarioState, NodeId, WarehouseEdge, WarehouseNode } from "./types";

export const HERO_SOURCE: NodeId = "INBOUND-01";
export const HERO_DESTINATION: NodeId = "RACK-A12";
export const HERO_BLOCKED_EDGE = ["N07", "N09"] as const satisfies readonly NodeId[];
export const HERO_GOLDEN_ROUTE = ["INBOUND-01", "N04", "N07", "N09", "RACK-A12"] as const satisfies readonly NodeId[];
export const HERO_ALTERNATE_ROUTE = ["INBOUND-01", "N04", "N07", "N08", "N11", "RACK-A12"] as const satisfies readonly NodeId[];

function createNodes(): WarehouseNode[] {
  return [
    { id: "INBOUND-01", label: "Inbound 01", kind: "inbound", x: 8, y: 48 },
    { id: "N01", label: "N01", kind: "junction", x: 15, y: 20 },
    { id: "N04", label: "N04", kind: "junction", x: 28, y: 48 },
    { id: "N07", label: "N07", kind: "junction", x: 47, y: 48 },
    { id: "N08", label: "N08", kind: "junction", x: 54, y: 76 },
    { id: "N09", label: "N09", kind: "junction", x: 67, y: 38 },
    { id: "N11", label: "N11", kind: "junction", x: 75, y: 72 },
    { id: "RACK-A12", label: "Rack A12", kind: "rack", x: 91, y: 31 },
    { id: "CHARGE-01", label: "Charge 01", kind: "charger", x: 91, y: 82 },
  ];
}

function createEdges(): WarehouseEdge[] {
  return [
    { id: "E-IN-04", from: "INBOUND-01", to: "N04", distanceMeters: 12, blocked: false },
    { id: "E-01-IN", from: "N01", to: "INBOUND-01", distanceMeters: 8.2, blocked: false },
    { id: "E-04-07", from: "N04", to: "N07", distanceMeters: 10, blocked: false },
    { id: "E-07-09", from: "N07", to: "N09", distanceMeters: 8.6, blocked: false },
    { id: "E-09-A12", from: "N09", to: "RACK-A12", distanceMeters: 11, blocked: false },
    { id: "E-07-08", from: "N07", to: "N08", distanceMeters: 6, blocked: false },
    { id: "E-08-11", from: "N08", to: "N11", distanceMeters: 8.4, blocked: false },
    { id: "E-11-A12", from: "N11", to: "RACK-A12", distanceMeters: 13, blocked: false },
    { id: "E-11-CHARGE", from: "N11", to: "CHARGE-01", distanceMeters: 7.4, blocked: false },
  ];
}

export function createHeroState(runId = "HERO-001-R0"): HeroScenarioState {
  return {
    scenarioId: "HERO-001",
    runId,
    worldRevision: 0,
    seedVersion: "hero-001-v1",
    safetyReservePercent: 20,
    preferredAgvId: "AGV-03",
    nodes: createNodes(),
    edges: createEdges(),
    fleet: [
      { id: "AGV-01", status: "charging", nodeId: "CHARGE-01", batteryPercent: 98, capacityKg: 1200, speedMps: 0.9, currentTaskId: null, heartbeatStatus: "online" },
      { id: "AGV-02", status: "moving", nodeId: "N11", batteryPercent: 64, capacityKg: 1200, speedMps: 0.85, currentTaskId: "TASK-207", heartbeatStatus: "online" },
      { id: "AGV-03", status: "idle", nodeId: "N01", batteryPercent: 86, capacityKg: 1200, speedMps: 0.87, currentTaskId: null, heartbeatStatus: "online" },
      { id: "AGV-04", status: "idle", nodeId: "N08", batteryPercent: 14, capacityKg: 1200, speedMps: 0.8, currentTaskId: null, heartbeatStatus: "online" },
    ],
    trafficReservations: [],
    pallet: { id: "P-104", status: "waiting", nodeId: "INBOUND-01", destinationNodeId: "RACK-A12" },
    proposal: null,
    mission: null,
    planningTrace: null,
    lastSafetyResult: null,
    webMcpTrace: [],
    decisionPipeline: { OBSERVE: "idle", PLAN: "idle", VALIDATE: "idle", APPROVE: "idle", EXECUTE: "idle", RECOVER: "idle" },
    metrics: {
      toolCalls: 0,
      totalToolLatencyMs: 0,
      completedMissions: 0,
      successfulReplans: 0,
      replanAttempts: 0,
      operatorApprovals: 0,
      operatorRejections: 0,
      unsafeRequests: 0,
      unsafeRejections: 0,
      transportAttempts: 0,
      industrialFaultTests: 0,
      industrialFaultSafeResponses: 0,
      communicationTimeouts: 0,
      trafficConflicts: 0,
    },
    benchmark: {
      mode: "idle",
      manual: {
        status: "idle",
        stepIndex: 0,
        humanInteractions: 0,
        startedAtMs: null,
        proposalReadyAtMs: null,
        elapsedMs: null,
        lastEvidence: "Ready to select P-104",
      },
      agent: {
        status: "idle",
        humanIntents: 0,
        humanApprovals: 0,
        toolCalls: 0,
        startedAtMs: null,
        proposalReadyAtMs: null,
        elapsedMs: null,
        toolComputeMs: 0,
        sequenceVerified: false,
      },
    },
    blockageInjected: false,
    telemetry: { scenarioClockMs: 0, distanceTravelledMeters: 0, replans: 0, pendingTimerCount: 0, faultState: "none", trace: [] },
  };
}
