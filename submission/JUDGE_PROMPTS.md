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

## SAFE-11 Communication Timeout

Press **TEST COMMUNICATION LOSS** on a fresh reset.

Expected:

- AGV-03 heartbeat changes from `online` to `expired` and the fleet reports `COMMS LOST`.
- Explicit assignment of AGV-03 is rejected because its communication heartbeat expired.
- `SAFE-11` reports `REJECT`, the deterministic fault trace records the event, and industrial-fault safe response is measured.

## SAFE-12 Traffic Reservation Conflict

Press **TEST TRAFFIC CONFLICT** on a fresh reset.

Expected:

- Segment `N07-N09` is reserved by AGV-02 and rendered as a reservation conflict.
- AGV-03 never enters the foreign reservation.
- The planner returns `INBOUND-01 -> N04 -> N07 -> N08 -> N11 -> RACK-A12`.
- `SAFE-12` reports `PASS` for the selected alternative route and the safe response is measured.

## Repeatability

Press RESET DEMO before each test. Mission, proposal, trace, metrics, timer, fault state, heartbeat status, traffic reservations, vehicle positions, batteries, pallet state, and blocked edges must return to HERO-001.
