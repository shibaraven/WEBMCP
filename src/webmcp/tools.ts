export const WEBMCP_TOOL_NAMES = [
  "get_operational_snapshot",
  "inspect_location",
  "plan_transport",
  "propose_transport",
  "get_mission_status",
  "replan_mission",
  "get_operation_metrics",
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];
export type WebMcpCommandExecutor = (name: WebMcpToolName, input: Record<string, unknown>) => unknown | Promise<unknown>;

const emptySchema = { type: "object", properties: {}, additionalProperties: false } as const;
const readOnly = { readOnlyHint: true, untrustedContentHint: false } as const;
const mutating = { readOnlyHint: false, untrustedContentHint: false } as const;

export function createWebMcpTools(executeCommand: WebMcpCommandExecutor): WebMcpTool[] {
  const execute = (name: WebMcpToolName) => async (input: Record<string, unknown>, options: { signal: AbortSignal }) => {
    if (options.signal.aborted) throw new DOMException("Tool execution cancelled", "AbortError");
    return executeCommand(name, input);
  };

  return [
    {
      name: "get_operational_snapshot",
      title: "Get warehouse snapshot",
      description: "Read the current HERO-001 warehouse, fleet, pallet, mission and blocked-edge state before planning an operation.",
      inputSchema: emptySchema,
      annotations: readOnly,
      execute: execute("get_operational_snapshot"),
    },
    {
      name: "inspect_location",
      title: "Inspect warehouse location",
      description: "Inspect one warehouse location and return its type, occupancy, pallet and AGV presence.",
      inputSchema: {
        type: "object",
        properties: { locationId: { type: "string", description: "Warehouse location identifier, for example INBOUND-01." } },
        required: ["locationId"],
        additionalProperties: false,
      },
      annotations: readOnly,
      execute: execute("inspect_location"),
    },
    {
      name: "plan_transport",
      title: "Plan safe pallet transport",
      description: "Calculate a deterministic transport plan with AGV selection, route, ETA, battery reserve and safety checks. This never starts a mission.",
      inputSchema: {
        type: "object",
        properties: {
          palletId: { type: "string", description: "Pallet identifier to transport." },
          destinationId: { type: "string", description: "Destination warehouse location identifier." },
        },
        required: ["palletId", "destinationId"],
        additionalProperties: false,
      },
      annotations: readOnly,
      execute: execute("plan_transport"),
    },
    {
      name: "propose_transport",
      title: "Create transport proposal",
      description: "Create a safe pallet transport proposal for human review. It cannot approve or start the mission.",
      inputSchema: {
        type: "object",
        properties: {
          palletId: { type: "string", description: "Pallet identifier to transport." },
          destinationId: { type: "string", description: "Destination warehouse location identifier." },
          agvId: { type: "string", description: "Optional AGV identifier. Omit to use deterministic selection." },
        },
        required: ["palletId", "destinationId"],
        additionalProperties: false,
      },
      annotations: mutating,
      execute: execute("propose_transport"),
    },
    {
      name: "get_mission_status",
      title: "Get mission status",
      description: "Read a mission's status, assigned AGV, current node, progress and blocked edge.",
      inputSchema: {
        type: "object",
        properties: { missionId: { type: "string", description: "Mission identifier, for example M-001." } },
        required: ["missionId"],
        additionalProperties: false,
      },
      annotations: readOnly,
      execute: execute("get_mission_status"),
    },
    {
      name: "replan_mission",
      title: "Replan blocked mission",
      description: "Replace a blocked mission route with the shortest safe available route. Only blocked missions can be replanned.",
      inputSchema: {
        type: "object",
        properties: { missionId: { type: "string", description: "Blocked mission identifier to replan." } },
        required: ["missionId"],
        additionalProperties: false,
      },
      annotations: mutating,
      execute: execute("replan_mission"),
    },
    {
      name: "get_operation_metrics",
      title: "Get operation metrics",
      description: "Read measured tool calls, approvals, missions, replans, safety rejections, selected AGV and route length.",
      inputSchema: emptySchema,
      annotations: readOnly,
      execute: execute("get_operation_metrics"),
    },
  ];
}
