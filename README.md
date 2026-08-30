# Physical AI WebMCP Command Center

A safe agent-native control layer for autonomous warehouses. The competition build exposes structured WebMCP tools that let a browser agent inspect warehouse state, create a deterministic transport proposal, wait for human approval, recover from a blocked aisle, and deliver pallet P-104.

## What It Does

- Runs the deterministic `HERO-001` warehouse digital twin entirely in the browser.
- Selects `AGV-03`, plans a 41.6 m route, estimates battery and validates safety.
- Requires explicit human approval before mission execution.
- Moves AGV-03 and P-104 through the warehouse map.
- Injects the `N07-N09` aisle blockage when AGV-03 reaches N07.
- Stops the vehicle before calculating the 7.8 m longer recovery route.
- Resumes and completes delivery at `RACK-A12`.
- Records real tool-call and planner-stage latency.

## Why WebMCP

Without WebMCP an agent must interpret and click a visual dashboard. With WebMCP the page publishes structured operational capabilities with JSON Schema, explicit read/write annotations, deterministic validation and visible effects in the same application state.

## Hero Scenario

1. Inspect the warehouse and P-104.
2. Plan transport from `INBOUND-01` to `RACK-A12`.
3. Create proposal `TP-001` using `AGV-03`.
4. Human approves the safe proposal.
5. Mission `M-001` starts and reaches N07.
6. `N07-N09` becomes blocked and AGV-03 stops.
7. Replan through `N08 -> N11 -> RACK-A12`.
8. Resume and complete the mission.

## WebMCP Tools

| Tool | Mode | Purpose |
|---|---|---|
| `get_operational_snapshot` | Read | Read fleet, mission, pallet and blockage state |
| `inspect_location` | Read | Inspect one warehouse location |
| `plan_transport` | Read | Run planner, selection and safety without starting a mission |
| `propose_transport` | Write | Create a proposal that requires human approval |
| `get_mission_status` | Read | Read live mission progress and blocked state |
| `replan_mission` | Write | Replace a blocked route with a safe alternative |
| `get_operation_metrics` | Read | Read measured mission and WebMCP metrics |

All descriptions stay within the recommended character budgets. Read tools use `readOnlyHint: true`; outputs contain deterministic internal state and use `untrustedContentHint: false`.

## Safety Model

The agent proposes. Deterministic software validates. A human authorizes execution. The simulator executes.

The current policy rejects invalid destinations, missing or unavailable pallets, occupied destinations, unavailable AGVs, battery below the 20% reserve, missing or blocked routes, competing missions and every unapproved mission start.

## Running Locally

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
```

Node.js 22.13 or newer is required. WebMCP discovery requires a compatible secure browser context; the production site uses HTTPS.

## Judge Test Instructions

1. Open the public site in a WebMCP-compatible browser or extension.
2. Confirm the header and trace panel report `7/7` tools.
3. Ask: `Move pallet P-104 from INBOUND-01 to RACK-A12 safely. Inspect the warehouse first, choose the best available AGV, and ask me for approval before starting.`
4. Approve `TP-001` in the page.
5. When `M-001` stops at N07, ask the agent to inspect and replan it.
6. Confirm P-104 arrives at RACK-A12.
7. Use `RESET DEMO` before repeating the scenario.

## Suggested Safety Prompts

- `Move pallet P-104 to RACK-Z99.`
- `Use AGV-04 even if its battery is too low.`

Both requests must be rejected by deterministic code, not model judgment.

## Architecture

React UI -> shared application state -> planner and safety policy -> mission simulator -> WebMCP adapter. The manual controls and all seven tools call the same domain functions.

## Known Limitations

- The Physical AI layer is a deterministic browser simulator, not a real AGV driver.
- WebMCP remains an experimental browser API and requires a compatible client.
- No MQTT, VDA5050, WMS, database, authentication or external service is required.

## License

MIT
