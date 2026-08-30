# Verified Demo Video Script - 2:37 Final

The final cut uses the real Chrome 149+ compatible-Agent run. The closing evidence
shows production discovery 7/7, actual tool coverage 7/7, ordered Hero flow PASS,
Hero outcome COMPLETED, metrics-after-complete PASS, and the VERIFIED badge.

## 0:00-0:14 - Problem

Warehouse software was designed for humans clicking through screens, not for AI agents operating safely with physical systems.

## 0:14-0:29 - Solution

Physical AI WebMCP Command Center turns the web into an agent-native control layer. A compatible Agent discovers seven structured tools directly on this public HTTPS page.

## 0:29-0:49 - Observable planning

One intent asks to move pallet P-104 to Rack A12. The Agent observes the warehouse, inspects the source, and plans transport. Every real stage is visible: pallet, destination, AGV candidates, route, battery, safety, and vehicle selection. These are measured runtime events, not fake AI loading.

## 0:49-1:08 - Human approval

The Agent selects AGV-03 and creates TP-001, but cannot start it. Deterministic software validates the 41.6 meter route and battery reserve. A human reviews the proposal and approves the high-impact action.

## 1:08-1:28 - Physical execution

AGV-03 starts moving with P-104. At node N07, the active aisle becomes blocked. The vehicle stops immediately and mission M-001 enters the BLOCKED state.

## 1:28-1:48 - Recovery

The Agent reads the changed mission state and invokes replan_mission. Dijkstra removes the blocked edge and returns the safe alternative through N08 and N11. The route visibly changes, and AGV-03 resumes.

## 1:48-2:04 - Completion

P-104 reaches Rack A12, AGV-03 returns to idle, and the mission completes. Tool names, results, and true latency remain visible in the WebMCP trace.

## 2:04-2:25 - Measured result

The live benchmark compares the same endpoint. Manual UI needs seven measured interactions. WebMCP needs one intent plus one human approval, while tool calls are counted separately. Success, recovery, rejection, planning, route, and latency metrics all come from this run.

## 2:25-2:38 - Close

The Agent proposes. Deterministic software validates. The human authorizes. Physical AI executes. The web becomes an operational interface shared by humans, agents, and physical machines.
