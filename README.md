# Physical AI WebMCP Command Center

Competition repo for a deterministic warehouse control surface. The current milestone delivers the complete HERO-001 domain seed, stable Dijkstra routing, reset invariants, automated tests, and a deployable public HTTPS shell.

## HERO-001 contract

- Pallet `P-104` waits at `INBOUND-01` and targets `RACK-A12`.
- Preferred vehicle `AGV-03` starts at `N01` with 86% battery.
- Four AGVs and a 20% safety reserve are always present after reset.
- Golden route: `INBOUND-01 → N04 → N07 → N09 → RACK-A12` (41.6 m).
- Blocking `N07 ↔ N09` deterministically selects `INBOUND-01 → N04 → N07 → N08 → N11 → RACK-A12` (49.4 m).
- Reset returns a deep-equal, reference-isolated copy of `hero-001-v1`.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

Node.js 22.13 or newer is required. The app uses React, TypeScript, vinext/Vite, Cloudflare Workers, and the OpenAI Sites deployment adapter.

## Project shape

- `src/domain/`: pure scenario state and routing logic
- `src/components/`: interactive competition shell
- `tests/domain/`: deterministic domain, Dijkstra, and reset tests
- `tests/rendered-html.test.mjs`: production SSR smoke tests
- `.openai/hosting.json`: Sites deployment identity and binding declaration

## Next milestone

Add the WebMCP tool adapter and judge-facing mission workflow without changing the HERO-001 seed contract.
