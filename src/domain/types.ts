export type NodeId =
  | "INBOUND-01"
  | "N01"
  | "N04"
  | "N07"
  | "N08"
  | "N09"
  | "N11"
  | "RACK-A12"
  | "CHARGE-01";

export type AgvId = `AGV-0${1 | 2 | 3 | 4}`;
export type AgvStatus = "idle" | "moving" | "waiting" | "blocked" | "charging" | "maintenance";
export type MissionStatus = "approved" | "running" | "blocked" | "replanning" | "completed" | "failed";
export type DecisionStage = "OBSERVE" | "PLAN" | "VALIDATE" | "APPROVE" | "EXECUTE" | "RECOVER";
export type StageStatus = "idle" | "active" | "complete" | "warning";

export interface WarehouseNode {
  id: NodeId;
  label: string;
  kind: "inbound" | "junction" | "rack" | "charger";
  x: number;
  y: number;
}

export interface WarehouseEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  distanceMeters: number;
  blocked: boolean;
}

export interface Agv {
  id: AgvId;
  status: AgvStatus;
  nodeId: NodeId;
  batteryPercent: number;
  capacityKg: number;
  speedMps: number;
  currentTaskId: string | null;
}

export interface Pallet {
  id: "P-104";
  status: "waiting" | "reserved" | "in_transit" | "stored";
  nodeId: NodeId;
  destinationNodeId: NodeId;
}

export interface RouteResult {
  found: boolean;
  path: NodeId[];
  distanceMeters: number;
  visitedNodeCount: number;
}

export interface SafetyCheck {
  id: string;
  label: string;
  passed: boolean;
  reason: string;
}

export interface SafetyResult {
  status: "safe" | "rejected";
  checks: SafetyCheck[];
  reason: string | null;
}

export interface PlanningStageTrace {
  id: string;
  label: string;
  durationMs: number;
  evidence: string;
}

export interface PlanningTrace {
  requestId: string;
  startedAt: number;
  totalPlanningMs: number;
  stages: PlanningStageTrace[];
  result: "safe" | "rejected";
}

export interface TransportPlan {
  palletId: "P-104";
  sourceId: NodeId;
  destinationId: NodeId;
  recommendedAgvId: AgvId;
  plannedRoute: NodeId[];
  distanceMeters: number;
  estimatedSeconds: number;
  batteryBefore: number;
  estimatedBatteryAfter: number;
  safety: SafetyResult;
  explanation: string;
}

export interface TransportProposal extends TransportPlan {
  id: "TP-001";
  status: "waiting" | "approved" | "rejected";
}

export interface Mission {
  id: "M-001";
  palletId: "P-104";
  sourceId: NodeId;
  destinationId: NodeId;
  agvId: AgvId;
  route: NodeId[];
  previousRoute: NodeId[] | null;
  routeIndex: number;
  status: MissionStatus;
  progressPercent: number;
  distanceMeters: number;
}

export interface WebMcpTraceEntry {
  id: number;
  toolName: string;
  status: "success" | "rejected" | "error";
  summary: string;
  latencyMs: number;
  timestamp: string;
}

export interface OperationMetrics {
  toolCalls: number;
  totalToolLatencyMs: number;
  completedMissions: number;
  successfulReplans: number;
  replanAttempts: number;
  operatorApprovals: number;
  operatorRejections: number;
  unsafeRequests: number;
  unsafeRejections: number;
  transportAttempts: number;
}

export type BenchmarkStatus = "idle" | "running" | "completed";

export interface ManualBenchmark {
  status: BenchmarkStatus;
  stepIndex: number;
  humanInteractions: number;
  startedAtMs: number | null;
  proposalReadyAtMs: number | null;
  elapsedMs: number | null;
  lastEvidence: string;
}

export interface AgentBenchmark {
  status: BenchmarkStatus;
  humanIntents: number;
  humanApprovals: number;
  toolCalls: number;
  startedAtMs: number | null;
  proposalReadyAtMs: number | null;
  elapsedMs: number | null;
}

export interface BenchmarkState {
  mode: "idle" | "manual" | "agent";
  manual: ManualBenchmark;
  agent: AgentBenchmark;
}

export interface HeroScenarioState {
  scenarioId: "HERO-001";
  seedVersion: "hero-001-v1";
  safetyReservePercent: 20;
  preferredAgvId: "AGV-03";
  nodes: WarehouseNode[];
  edges: WarehouseEdge[];
  fleet: Agv[];
  pallet: Pallet;
  proposal: TransportProposal | null;
  mission: Mission | null;
  planningTrace: PlanningTrace | null;
  lastSafetyResult: SafetyResult | null;
  webMcpTrace: WebMcpTraceEntry[];
  decisionPipeline: Record<DecisionStage, StageStatus>;
  metrics: OperationMetrics;
  benchmark: BenchmarkState;
  blockageInjected: boolean;
  telemetry: {
    scenarioClockMs: number;
    distanceTravelledMeters: number;
    replans: number;
    pendingTimerCount: number;
    faultState: "none" | "aisle_blockage";
    trace: string[];
  };
}

export interface PlanTransportInput {
  palletId: string;
  destinationId: string;
  agvId?: string;
}

export type PlanTransportResult =
  | { status: "plan_available"; plan: TransportPlan; trace: PlanningTrace }
  | { status: "rejected"; reason: string; safety: SafetyResult; trace: PlanningTrace };
