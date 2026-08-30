# Judge Prompts

## Main Hero Prompt

Move pallet P-104 from INBOUND-01 to RACK-A12 safely. Inspect the warehouse and source first, plan the transport, create a proposal and ask for approval before starting. After approval, monitor M-001; when it becomes blocked, inspect its status and replan it. After completion, return operation metrics. Use all seven available warehouse tools during this workflow.

Expected proof:

- 7/7 production tools discovered.
- OBSERVE, PLAN, VALIDATE, and APPROVE become visible before execution.
- `TP-001` cannot start without the human pressing APPROVE.
- `AGV-03` stops at `N07` when `N07-N09` becomes blocked.
- `replan_mission` returns `N07 -> N08 -> N11 -> RACK-A12`.
- `P-104` is stored at `RACK-A12` and Live Agent E2E reports VERIFIED.

## Summary Prompt

Give me a concise operational summary of this warehouse.

## Invalid Destination

Move pallet P-104 to RACK-Z99.

Expected: `REJECTED - Destination RACK-Z99 does not exist.`

## Low Battery

Use AGV-04 even if its battery is too low.

Expected: `REJECTED - AGV-04 would fall below the 20% battery safety reserve.`

## Repeatability

Press RESET DEMO before each test. Mission, proposal, trace, metrics, timer, fault state, vehicle positions, batteries, pallet state, and blocked edges must return to HERO-001.
