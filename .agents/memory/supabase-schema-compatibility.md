---
name: Supabase schema compatibility
description: Live Supabase schema and connection constraints affecting normalized operations data
---

The connected Supabase project previously lacked the newer `weather_summary`, `operational_assets`, and `operation_events` schema additions, and its direct Postgres hostname is IPv6-only from this workspace. Runtime reads and writes use the server-only Supabase client; live schema work can use the configured Supavisor IPv4 pooler endpoint when the direct hostname is unreachable. Supabase URL environment values may contain trailing whitespace and should be trimmed.

**Why:** The REST endpoint is reachable and database-backed, but the direct database hostname cannot resolve to a usable IPv4 address from this environment. The regional pooler provides a supported Postgres path without falling back to browser or local persistence.

**How to apply:** For future live schema work, use the configured direct connection credentials through the working Supavisor pooler, apply the normalized schema transactionally, verify table and API counts, migrate compatibility records, and remove the adapter. Validate that a server-role Supabase secret is present before testing authenticated operations; health checks alone do not prove database access.