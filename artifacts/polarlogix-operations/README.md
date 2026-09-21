# PolarLogix - SIH 2026 Operations Console

PolarLogix is an integrated polar expedition logistics and asset-management command system for NCPOR and MoES teams. It provides a shared operational view across expedition planning, cargo cold-chain telemetry, life-support inventory, personnel movement, and emergency response.

## Implemented modules

- **Operations overview** — station readiness, active voyage, cargo health, fuel runway, personnel muster, weather condition, and a cross-module activity stream.
- **Expedition planning** — voyage timeline, mission milestones, critical-path delay state, and a Create Voyage flow.
- **Cargo tracking** — cold-chain telemetry, temperature history, shock and battery signals, cargo hold/grid view, and an injectable temperature-spike alert.
- **Inventory and life support** — Vital/Essential/Desirable inventory matrix, stock increase/decrease actions, fuel burn projection, and conservation-mode effects.
- **Personnel movement** — muster roll, medical and ITBP readiness, indoor/field/SOS controls, and field-safety status.
- **Emergency command center** — Condition 1 blizzard lockdown, active incidents, cascade event log, station lockdown state, and recovery control.
- **Assets, maps, field operations, audit reports, and scenario rehearsal**.

## Technology

- React + Vite + TypeScript
- Tailwind CSS and reusable UI primitives
- Clerk-managed authentication with same-origin session cookies
- Express API server with server-only Supabase service-role access
- Supabase/PostGIS operational schema
- Recharts for telemetry and burn-rate charts
- Wouter for lightweight route handling
- Leaflet for polar map views

The browser does not contain a Supabase client or a second data store. It sends same-origin requests to the authenticated API. The API reads and writes the connected Supabase project, and no operational data is persisted in Replit PostgreSQL, localStorage, browser fallback state, or an offline queue.

## Run locally

From the workspace root:

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/polarlogix-operations run dev
```

The managed preview supplies the app port and base path. For a regular local shell, use the Vite command with the required `PORT` and `BASE_PATH` environment variables.

## Authentication

1. Open `/sign-up` and create a development operator account, or open `/sign-in` for an existing Clerk account.
2. After authentication, the operations console loads its snapshot from the API.
3. Sign out from the command header to return to the public landing page.

All `/api/operations` reads and writes require a valid Clerk session. The server rejects unauthenticated requests with `401` before the operations service runs.

## Supabase setup

1. Create or select the Supabase project that owns the operational data.
2. Apply `schema.sql` through the supported Supabase migration workflow.
3. Configure the API server with the Supabase project URL and server-only service-role secret. Do not expose the service-role secret in a `VITE_*` or `NEXT_PUBLIC_*` variable.
4. Configure the managed Clerk authentication keys through the Replit Auth pane.
5. The API server uses Supabase REST for all runtime reads, inserts, updates, deletes, CRUD operations, and synchronization. It does not use Replit PostgreSQL, Drizzle runtime storage, direct Postgres connections, or startup DDL.

## Demo flow

1. Sign in and start on the operations overview.
2. Open **Emergency** and activate **Simulate Condition 1 Lockdown**.
3. Return to Overview, Personnel, Cargo, Inventory, and Expedition to inspect the shared cascade:
   - active field personnel are flagged for immediate muster;
   - cargo handling is paused and cold-chain posture is highlighted;
   - generator/fuel burn projection increases;
   - voyage milestones show the delayed critical path.
4. Use the audit module to review persisted events and export the current Supabase-backed audit record.
