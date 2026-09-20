# PolarLogix Operations

PolarLogix is a polar expedition command-center prototype for planning voyages, tracking cold-chain cargo, managing life-support inventory, monitoring personnel safety, and coordinating emergency lockdown cascades.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/polarlogix-operations/src/` — React + Vite operations console.
- `artifacts/polarlogix-operations/schema.sql` — Supabase/PostGIS production schema aligned to the prototype.
- `artifacts/polarlogix-operations/README.md` — setup and demo flow.

## Architecture decisions

- The first-build demo uses browser persistence and a shared reactive state layer so every judge-facing action works without requiring third-party credentials.
- The emergency simulation is intentionally cross-module: weather state drives personnel muster, cargo pause, inventory burn adjustment, and expedition delay.
- `schema.sql` preserves the production-oriented PostGIS and realtime model from the technical specification for later Supabase wiring.

## Product

The console supports the five SIH modules plus a judge-friendly normal-operations-to-blizzard-lockdown scenario and offline queue/sync demonstration.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The prototype is intentionally self-contained; cloud persistence is documented but not required to explore the UI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
