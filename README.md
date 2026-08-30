# Physical AI WebMCP Command Center

**An Agent-Native Control Layer for Autonomous Warehouses**

[Live HTTPS application](https://physical-ai-webmcp-hero001.mingjen.chatgpt.site) · [Public source](https://github.com/shibaraven/WEBMCP)

Warehouse software was designed for humans clicking through screens. Physical AI WebMCP Command Center lets an AI browser agent understand warehouse state, propose a safe transport, collaborate with a human operator, react to a blocked aisle, and complete the mission through structured WebMCP tools.

## What It Does

- Runs the deterministic `HERO-001` warehouse digital twin entirely in the browser.
- Selects `AGV-03` and plans the 41.6 m route from `INBOUND-01` to `RACK-A12`.
- Measures every real planner stage with `performance.now()`; there is no fake AI loading delay.
- Requires explicit human approval before mission execution.
- Moves `AGV-03` and pallet `P-104` through the live warehouse map.
- Blocks `N07-N09`, stops the vehicle, replans through `N08 -> N11`, and completes the 49.4 m actual journey with 77% projected battery remaining.
- Publishes seven structured WebMCP tools and shows every WebMCP-origin invocation, input, result, run ID, timestamp, and measured latency on screen.
- Compares a seven-interaction Manual UI workflow against one Agent intent plus one human approval using identical benchmark boundaries and business logic.

## Why WebMCP

Without WebMCP, an agent must interpret a dashboard and guess which controls represent warehouse operations. With WebMCP, the page publishes typed operational capabilities with JSON Schema, read/write annotations, deterministic validation, and visible effects in the same application state.

Removing WebMCP removes the structured Agent interaction model; the product is not a click-automation demo.

## Hero Scenario

1. Discover all seven tools on the public HTTPS origin.
2. Read the warehouse snapshot and inspect `INBOUND-01`.
3. Plan transport for `P-104` to `RACK-A12`.
4. Create proposal `TP-001` with `AGV-03`.
5. Receive explicit human approval.
6. Start mission `M-001` and move to `N07`.
7. Detect the `N07-N09` blockage and stop.
8. Inspect the blocked mission and replan through `N08 -> N11`.
9. Resume and deliver `P-104` to `RACK-A12`.
10. Read the final operation metrics.

## What Humans and Agents Do Together

| Participant | Responsibility |
|---|---|
| Human | Express one intent, review the proposal, and approve or reject the high-impact action |
| Browser Agent | Observe state, inspect locations, plan, propose, monitor, replan, and summarize metrics through WebMCP |
| Deterministic software | Enforce destination, occupancy, availability, battery, route, concurrency, and approval rules |
| Physical AI simulator | Execute movement, expose the blockage, stop safely, resume, and complete the mission |

The architecture is deliberately not `LLM -> Robot`. The Agent proposes, deterministic software validates, the human authorizes, and Physical AI executes.

## WebMCP Tools

| Tool | Annotation | Hero use |
|---|---|---|
| `get_operational_snapshot` | `readOnlyHint: true` | Observe fleet, pallet, mission, and blockage state |
| `inspect_location` | `readOnlyHint: true` | Inspect the source or another warehouse node |
| `plan_transport` | `readOnlyHint: true` | Measure planner stages and return a safe plan without starting a mission |
| `propose_transport` | `readOnlyHint: false` | Create `TP-001`; human approval remains mandatory |
| `get_mission_status` | `readOnlyHint: true` | Observe running, blocked, replanning, or completed state |
| `replan_mission` | `readOnlyHint: false` | Replace a blocked route only inside the human-approved recovery envelope |
| `get_operation_metrics` | `readOnlyHint: true` | Read runtime KPIs and Human vs Agent evidence |

Every tool uses a strict object schema with `additionalProperties: false`. Five tools are read-only; only proposal creation and mission replanning mutate state. All tools are same-origin and respect `AbortSignal` cancellation.

## Architecture

```text
Compatible Browser Agent
          |
       WebMCP
          |
Shared React Application State
  |        |        |        |
Planner  Safety  Mission  Metrics
  |                 |
Dijkstra        AGV Simulator
          |
Visible Digital Twin / Approval / Trace
```

Manual controls and WebMCP tools call the same planner, safety policy, mission engine, and HERO-001 seed. Invocation provenance remains separate: manual controls never create WebMCP trace evidence, increment WebMCP tool-call metrics, or satisfy Live E2E verification.

## Observable Planning

The main screen exposes the real operational sequence:

`OBSERVE -> PLAN -> VALIDATE -> APPROVE -> EXECUTE -> RECOVER`

`plan_transport` records measured evidence for pallet inspection, destination validation, AGV evaluation, route calculation, battery reserve, safety constraints, and vehicle selection. Each stage and the total use real timestamps; UI transitions are never reported as planner compute time.

## Safety Model

The deterministic policy rejects:

- unknown destinations or pallets;
- non-transportable pallets and occupied destinations;
- unavailable or already assigned AGVs;
- battery below the 20% post-mission reserve;
- missing routes or routes containing blocked edges;
- competing active missions;
- every attempt to start before human approval.
- expired proposals, changed world revisions, or a plan fingerprint that no longer matches current state;
- starts where the route, destination, battery, AGV reservation, or pallet reservation changed after approval;
- recovery that changes destination, adds more than 10 m, drops below the 20% reserve, or no longer owns the assigned resources.

Every proposal is bound to a world revision, deterministic plan fingerprint, and five-minute approval window. Approval recomputes the exact plan before reserving resources. It grants a bounded recovery envelope for the same destination, at most 10 m additional travel, and at least 20% projected battery; it does not grant arbitrary replanning authority.

At `N07`, the active edge becomes blocked before replanning. The AGV stops and the mission enters `BLOCKED`; it never teleports or silently repairs itself. Replan success is recorded only after the recovered mission reaches its destination.

## Running Locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
npm run lint
```

WebMCP requires a secure compatible client. For the challenge, use the ChatGPT in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and restarted.

## Judge Test Instructions

1. Open the [public site](https://physical-ai-webmcp-hero001.mingjen.chatgpt.site) in a compatible Agent browser.
2. Press **RESET DEMO** and confirm Mission, Proposal, Trace, Metrics, Timer, and Fault all show zero/none.
3. Confirm the page reports `7/7 tools` discovered.
4. Send the Main Hero Prompt below and approve `TP-001` only after reviewing AGV, route, ETA, battery, and safety.
5. When `M-001` stops at `N07`, let the Agent inspect status and invoke `replan_mission`.
6. Confirm `P-104` reaches `RACK-A12`, all seven tool names appear in the trace, and the Live Agent E2E card reports **VERIFIED**.
7. Reset, then run both safety prompts. Both must be rejected by code.

## Verified Production Run

On August 30, 2026, the Hero Prompt completed in Chrome 149+ through a compatible
ChatGPT Work Agent against the public HTTPS deployment. The page reported 7/7
production tools registered, 7/7 distinct tools invoked in the required order,
Hero outcome `COMPLETED`, metrics-after-complete `PASS`, and Live Agent E2E
`VERIFIED`. The run used one human approval, recovered once from the N07 blockage,
finished on the 49.4 m alternate route, and left AGV-03 at 77% battery.

The [2:37 verified demo video](submission/physical-ai-webmcp-demo.mp4) uses English
narration and hard-burned English subtitles. Its final evidence frames come from
that production Agent run.

## Suggested Prompts

**Main Hero Prompt**

> Move pallet P-104 from INBOUND-01 to RACK-A12 safely. Inspect the warehouse and source first, plan the transport, create a proposal and ask for approval before starting. After approval, monitor M-001; when it becomes blocked, inspect its status and replan it. After completion, return operation metrics. Use all seven available warehouse tools during this workflow.

**Operational Summary**

> Give me a concise operational summary of this warehouse.

**Invalid Destination**

> Move pallet P-104 to RACK-Z99.

**Low Battery**

> Use AGV-04 even if its battery is too low.

## Benchmark Results

The live benchmark uses the same start and stop events for both modes:

| Mode | Start | Stop | Human input | Tool calls |
|---|---|---|---|---|
| Manual UI | First task-specific selection | `TP-001` created and rendered | Seven measured clicks/selections | N/A |
| WebMCP Agent | First WebMCP call for the intent | `propose_transport` returns and `TP-001` renders | One intent; approval counted separately | Measured separately |

The Agent wall-clock benchmark starts on the first WebMCP call and stops only when the required observe -> inspect -> plan -> propose sequence produces `TP-001`. Tool compute time is shown separately and freezes at the same boundary. UI clicks cannot start or complete this benchmark. The page calculates interaction reduction and speedup only after that WebMCP sequence is verified.

Mission metrics distinguish the original 41.6 m route, current remaining distance, projected total distance, and final 49.4 m actual distance. Empty rate denominators display `N/A`; sub-resolution planner timings are labeled honestly instead of rendered as fabricated `0.000 ms` work.

Live E2E reports **VERIFIED** only when production discovery is 7/7, all seven current-run WebMCP tools occur in Hero order, `M-001` completes, and `get_operation_metrics` is called after completion.

## Work Created During WebMCP Challenge

This competition repository contains the challenge-period WebMCP extension work: the deterministic warehouse domain, Dijkstra planner, safety policy, approval-gated mission engine, AGV simulator, dynamic blockage and recovery, seven-tool WebMCP adapter, observable planning pipeline, runtime benchmark instrumentation, reset guarantees, tests, public deployment, and submission material.

The commit history is intentionally incremental and dated within the August 25 - September 3, 2026 submission period so judges can distinguish this work from any pre-existing warehouse experiments.

## Known Limitations

- The Physical AI layer is a deterministic browser simulator, not a real AGV driver.
- WebMCP is an experimental browser API and requires the supported ChatGPT browser or an enabled Chrome build.
- The competition build intentionally has no MQTT, VDA5050, WMS, database, authentication, or external runtime dependency.
- Timer values depend on the browser and device running the benchmark; the UI always reports that run's actual values.

## Future Physical AI Integration

The same safe interface can sit above a fleet-management system and connect approved missions to VDA5050, MQTT, vendor APIs, PLCs, or AMR orchestration. The deterministic policy and human approval boundary remain between the Agent's intent and physical execution.

## License

[MIT](LICENSE)
