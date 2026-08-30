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

export type AgvStatus = "idle" | "moving" | "charging" | "maintenance";

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
  id: `AGV-0${1 | 2 | 3 | 4}`;
  status: AgvStatus;
  nodeId: NodeId;
  batteryPercent: number;
  currentTaskId: string | null;
}

export interface Pallet {
  id: "P-104";
  status: "waiting" | "assigned" | "in_transit" | "delivered";
  nodeId: NodeId;
  destinationNodeId: NodeId;
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
  mission: {
    id: "MISSION-HERO-001";
    status: "unassigned" | "assigned" | "running" | "completed";
    assignedAgvId: Agv["id"] | null;
  };
  telemetry: {
    scenarioClockMs: number;
    distanceTravelledMeters: number;
    replans: number;
    trace: string[];
  };
}

export interface RouteResult {
  found: boolean;
  path: NodeId[];
  distanceMeters: number;
  visitedNodeCount: number;
}
