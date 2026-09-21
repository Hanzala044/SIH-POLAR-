# PolarLogix Operations

PolarLogix is a polar expedition command center for planning voyages, tracking cold-chain cargo, managing life-support inventory, monitoring personnel safety, and coordinating emergency lockdown cascades.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Supabase-backed API server.
- `pnpm --filter @workspace/polarlogix-operations run dev` — run the authenticated React operations console.
- `pnpm run typecheck` — full typecheck across all packages.
- `pnpm run build` — typecheck and build all packages.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9.
- API: Express 5 with Clerk session middleware.
- Web: React + Vite with Clerk sign-in and sign-up routes.
- Data: Supabase REST through the server-only service-role client.
- Schema: Supabase/PostGIS SQL in `artifacts/polarlogix-operations/schema.sql`, applied through a supported Supabase migration path.

## Where things live

- `artifacts/polarlogix-operations/src/` — React + Vite operations console.
- `artifacts/polarlogix-operations/schema.sql` — Supabase/PostGIS production schema.
- `artifacts/api-server/src/lib/supabase.ts` — server-only Supabase client.
- `artifacts/api-server/src/lib/operations-service.ts` — Supabase CRUD and operational synchronization service.
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk frontend API proxy for production.

## Architecture decisions

- Supabase is the only application data store. Runtime reads, inserts, updates, deletes, CRUD operations, synchronization, and temporary operational state go through the API server to Supabase.
- The browser never uses localStorage, a browser Supabase client, seeded fallback state, or an offline queue for operational data.
- The API server does not use Replit PostgreSQL, Drizzle runtime storage, direct Postgres connections, or startup DDL.
- Clerk manages operator identity and same-origin session cookies. Operations API routes return `401` unless the request has a valid Clerk session.
- The frontend sends normal same-origin requests to the API. It never receives or sends Supabase service-role credentials.
- Operational writes remain server-side so the service role is never exposed to the browser.

## Product

The console supports expedition overview, voyage tracking, cargo telemetry, inventory, personnel safety, emergency cascades, assets, maps, field operations, audit reports, and scenario rehearsal.

## Gotchas

- Create an operator account from `/sign-up` or sign in from `/sign-in` before opening the operations modules.
- Schema changes must be applied through the supported Supabase migration workflow; do not add runtime database bootstrap or a local database fallback.