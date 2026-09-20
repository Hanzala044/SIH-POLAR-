# PolarLogix - SIH 2026 Prototype

PolarLogix is an integrated polar expedition logistics and asset-management command system for Smart India Hackathon Problem Statement 26062. It gives NCPOR and MoES teams a shared operational view across expedition planning, cargo cold-chain telemetry, life-support inventory, personnel movement, and emergency response.

This console runs in two modes. Without Supabase configuration it uses the seeded browser demo so the judge-facing flows remain available. With Supabase configuration it loads operational data from PostgreSQL, writes mutations through Supabase CRUD, and listens for emergency inserts over Realtime. The production schema and policies are included in `schema.sql`.

## Implemented modules

- **Operations overview** — station readiness, active voyage, cargo health, fuel runway, personnel muster, weather condition, and a cross-module activity stream.
- **Expedition planning** — voyage timeline, mission milestones, critical-path delay state, and a Create Voyage flow.
- **Cargo tracking** — cold-chain telemetry, temperature history, shock and battery signals, cargo hold/grid view, and an injectible temperature-spike alert.
- **Inventory and life support** — Vital/Essential/Desirable inventory matrix, stock increase/decrease actions, fuel burn projection, and conservation-mode effects.
- **Personnel movement** — muster roll, medical and ITBP readiness, indoor/field/SOS controls, and field-safety status.
- **Emergency command center** — Condition 1 blizzard lockdown, active incidents, cascade event log, station lockdown state, and recovery control.
- **Offline resilience demo** — toggle simulated satellite link loss, queue local operations, and sync them when connectivity returns.

## Technology

- React + Vite + TypeScript
- Tailwind CSS and reusable shadcn-style UI primitives
- Lucide React icons
- Recharts for telemetry and burn-rate charts
- Wouter for lightweight route handling
- Browser localStorage for the no-credentials prototype mode and the intermittent-link queue
- Supabase JS client for PostgreSQL CRUD and emergency Realtime subscriptions
- Supabase/PostgreSQL-compatible schema with PostGIS, RLS policies, and the emergency Realtime publication

The reference system architecture calls for a Next.js/PWA client, Supabase/PostgreSQL, TimescaleDB telemetry, MapLibre/Leaflet polar GIS, and edge synchronization. This workspace uses the supported React + Vite artifact runtime for the judgeable prototype while keeping the domain model and schema aligned with that production direction.

## Run locally

From the workspace root:

```bash
pnpm install
pnpm --filter @workspace/polarlogix-operations run dev
```

The managed preview supplies the app port and base path. For a regular local shell, use the Vite command with the required `PORT` and `BASE_PATH` environment variables.

## Production Supabase setup

1. Create a Supabase project with PostGIS enabled.
2. Run `schema.sql` in the Supabase SQL editor.
3. Configure the client with public Supabase browser variables. `VITE_*` is preferred for this Vite artifact; the `NEXT_PUBLIC_*` names are also accepted for compatibility:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   The anon key is intended for browser use; do not put a Supabase service-role key in a `VITE_*` variable.
4. Set the signed-in user's Supabase Auth `app_metadata.role` to one of `NCPOR_ADMIN`, `NCPOR_COMMANDER`, or `NCPOR_OPERATIONS`. The policies in `schema.sql` deny operational reads and writes to unauthenticated or unassigned users.
5. Run the RLS and publication section at the end of `schema.sql` after the base tables exist. It protects stations, voyages, cargo manifest and telemetry, inventory, personnel, field sorties, and emergency incidents, and adds `emergency_incidents` to `supabase_realtime`.
6. The client loads stations, voyages, cargo plus latest telemetry, inventory, personnel, and the current unresolved incident on startup. Voyage creation, inventory adjustments, personnel status changes, telemetry anomaly inserts, emergency cascades, and incident recovery are written to Supabase.
7. The header subscribes to `INSERT` events on `emergency_incidents`; an incident created by another station immediately updates the global lockdown banner and activity feed without a refresh.
8. Use the network control in the header to simulate link loss. Mutations are applied optimistically and stored as a durable queue in `localStorage`; reconnecting flushes the queue in order. In no-credentials demo mode, reconnecting clears the simulated queue as before.

## Demo flow

1. Start on the operations overview and review the current Condition 2 weather posture.
2. Open **Emergency** and activate **Simulate Condition 1 Lockdown**.
3. Return to the overview, Personnel, Cargo, Inventory, and Expedition screens to see the shared cascade:
   - active field personnel are flagged for immediate muster;
   - cargo handling is paused and cold-chain posture is highlighted;
   - generator/fuel burn projection increases;
   - voyage milestones show the delayed critical path.
4. Toggle the satellite link offline, perform an inventory or personnel action, then reconnect to demonstrate queued sync. With Supabase configured, the queued writes are retried against the live database.
5. Use **Reset demo** in the command menu to restore the normal-operations scenario.

## Demo credentials

The local prototype does not require authentication. For a production Supabase Auth demo, use a seeded judge account such as:

- Email: `commander@polarlogix.in`
- Password: `SIH2026_Secure!`

Do not use these sample credentials in a production deployment.