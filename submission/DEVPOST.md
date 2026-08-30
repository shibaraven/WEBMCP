# Devpost Submission Copy

## Project name

Physical AI WebMCP Command Center

## Tagline

An Agent-Native Control Layer for Autonomous Warehouses

## Short description

Warehouse software was designed for humans clicking screens. Physical AI WebMCP Command Center gives browser agents seven structured WebMCP tools to observe a warehouse, plan and propose a safe pallet move, collaborate with a human approver, recover from a blocked aisle, and complete a Physical AI mission with measurable evidence.

## Inspiration

Physical AI is moving from isolated robot demos into shared operational environments. Yet most warehouse portals expose only human-oriented dashboards. Browser agents can click those interfaces, but they must infer meaning from pixels and DOM structure. We wanted the web itself to expose a safe, typed operational contract that humans, agents, and autonomous machines could share.

## What it does

The public app runs a deterministic warehouse digital twin. One natural-language intent asks an Agent to move pallet P-104 from INBOUND-01 to RACK-A12. Through WebMCP, the Agent reads warehouse state, inspects the source, measures a transport plan, selects AGV-03, and creates a proposal. Deterministic software validates destination, occupancy, vehicle availability, battery reserve, route safety, mission concurrency, communication heartbeat, traffic reservations, and approval state. A human must approve before movement begins.

The Industrial Resilience panel implements the specification's strict `SAFE-11` and `SAFE-12` rules. An expired communication heartbeat makes an AGV unavailable and causes deterministic rejection. A foreign traffic reservation becomes non-traversable: the AGV waits before entry or the planner returns a safe alternate route.

AGV-03 then moves along the visible route. At N07, the N07-N09 aisle becomes blocked. The AGV stops, M-001 becomes BLOCKED, and the Agent reads the changed state before replanning through N08 and N11. The mission resumes and P-104 is delivered to RACK-A12.

Every WebMCP-origin call, input, result, run ID, timestamp, and measured latency is visible; manual fallback controls cannot manufacture Agent evidence. The planner exposes real per-stage timings for pallet, destination, AGV, route, battery, safety, and selection. A live Human vs Agent benchmark compares the same intent-to-proposal boundary: seven Manual UI interactions versus one Agent intent plus one human approval, with WebMCP compute and wall-clock time reported separately.

## Why WebMCP is a strong fit

Without WebMCP, a browser agent sees a warehouse dashboard and guesses how UI controls map to physical operations. With WebMCP, the site publishes seven typed operational capabilities with strict JSON Schema and read/write annotations. The Agent can discover state, plan without actuation, propose an approval-gated action, monitor execution, recover from environmental change, and read metrics. WebMCP is the product's interaction layer, not an optional wrapper.

## How it improves the user experience

Operators no longer need to navigate several fleet, pallet, route, and mission screens just to prepare one safe action. They express intent once, review one proposal card, and retain authority over execution. The visible decision pipeline and trace make the Agent's verifiable system actions understandable without exposing or inventing chain-of-thought.

## How we built it

The app is React and TypeScript on a public HTTPS deployment. A shared deterministic state engine powers both Manual UI and WebMCP. Dijkstra routing produces the 41.6 m golden route and the 49.4 m recovery route. The safety policy is pure code. The imperative WebMCP adapter registers exactly seven tools with strict schemas, correct read-only annotations, cancellation support, and same-origin discovery. The simulator drives AGV movement, fault injection, stop, replan, resume, and completion. `performance.now()` measures planner stages, tool latency, and benchmark boundaries.

## Challenges

The central challenge was preserving a trustworthy boundary between language-model intent and physical execution. Planning must never start a mission; proposal creation must never imply approval; a blockage must stop the AGV before replanning; and every displayed metric must come from runtime instrumentation rather than a scripted animation. Each proposal is therefore bound to a world revision, deterministic plan fingerprint, five-minute validity window, and a human-visible recovery envelope limited to the same destination, at most 10 m extra distance, and at least 20% battery.

## Accomplishments

- Seven meaningful WebMCP tools with visible production discovery and trace.
- Approval cannot be bypassed by UI or Agent.
- Deterministic 49.4 m blockage recovery with truthful 77% battery projection, without teleporting or hidden reset.
- Real planner stage latency and fair Manual vs Agent benchmark boundaries.
- Complete reset of mission, proposal, trace, metrics, timers, fault state, vehicles, pallet, and routes.
- Deterministic communication-timeout rejection and traffic-reservation avoidance, with visible fault trace and measured safe-response metrics.
- Public HTTPS app with no account, key, database, broker, or hardware requirement.

## What we learned

Agent-native UX is not about replacing human control. The strongest interface separates responsibilities: the model expresses what it wants, WebMCP defines how it asks, deterministic software decides what is allowed, the human authorizes high-impact action, and the physical system executes.

## What's next

The same interface can sit above a production fleet-management system. Approved missions can be translated into VDA5050, MQTT, PLC, or vendor API commands while keeping deterministic policy, audit traces, and human authorization between Agent intent and physical machinery.

## Links

- Live app: https://physical-ai-webmcp-hero001.mingjen.chatgpt.site
- Public repository: https://github.com/shibaraven/WEBMCP
- Video: https://github.com/shibaraven/WEBMCP/blob/main/submission/physical-ai-webmcp-demo.mp4

The 2:37 master contains English narration and hard-burned English subtitles. Its
closing evidence is from the August 30 Chrome 149+ compatible-Agent run: production
discovery 7/7, tool coverage 7/7, ordered flow PASS, outcome COMPLETED, metrics
after completion PASS, and Live Agent E2E VERIFIED.

## Testing instructions

Use the ChatGPT in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. Open the live app, press RESET DEMO, confirm 7/7 tools, and run the Main Hero Prompt from `submission/JUDGE_PROMPTS.md`. Approve TP-001 only when requested. The completed run must show all seven tool names in the trace and VERIFIED in the Live Agent E2E card.
