# AGENTS.md

Muse Code reads this file as project rules when it runs in this directory.

## What KEEPLIT is

An AI operator for small solar + battery + generator sites (clinics, shops, homes).
It plans the next 24 hours every hour so the generator burns less fuel and the
critical load (the clinic fridge) never goes down. It runs in the browser and works offline.

## Layout

- `packages/sim` — plant simulator (15-minute steps), scenarios (Lagos clinic, Palawan village), old inverter rules (`baseline.ts`).
- `packages/planner` — `planner.ts` (MILP-MPC with `highs`, 1-hour slots, 24 h horizon), `whatif.ts` ("Can I run X?"), `compare.ts` (old rules vs KEEPLIT).
- `apps/web` — React 19 + Vite + Tailwind v4 PWA. The planner runs in Web Workers (`planner.worker.ts`, `ask.worker.ts`).

## Commands

- Web app: `npm run dev -w @keeplit/web`
- Build: `npm run build -w @keeplit/web`
- Lint: `npm run lint -w @keeplit/web`
- Planner vs old rules: `npx tsx packages/planner/src/compare.ts 5 --save` (rewrites `apps/web/src/results.json`)

## Rules

- TypeScript only, npm workspaces (not pnpm). Imports use relative paths with `.ts`/`.tsx` extensions.
- Never commit secrets. The Meta key lives in `$env:META_API_KEY` or an ignored `.env`.
- Don't change the planner's cost weights or `MIN_LOAD_FRACTION` without re-running `compare.ts` and reporting the numbers before and after.
- Every number shown in the UI must come from the simulator or planner, never hard-coded.
- Design tokens are in `apps/web/src/index.css` (`@theme`). Use them (`bg-panel`, `text-accent`, `font-display`, ...); don't add new colours or fonts.
- Square buttons, rounded panels (`rounded-2xl border border-line bg-panel`), accent `#FFC94D`.
- Keep the app working offline: no runtime network calls except the Meta Model API, and every feature must have an offline fallback.
- Ask before installing new packages or deleting files.