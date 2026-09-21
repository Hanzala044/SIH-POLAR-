#!/usr/bin/env bash
set -euo pipefail

# PolarLogix stores runtime data in Supabase. Do not reintroduce a local
# PostgreSQL/Drizzle migration step here; schema changes are applied through
# the supported Supabase migration workflow.
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/polarlogix-operations run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/polarlogix-operations run build
