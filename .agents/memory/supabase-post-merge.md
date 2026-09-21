---
name: Supabase-only merge setup
description: The post-merge setup constraint for PolarLogix after removing local database tooling.
---

Post-merge setup must install dependencies and validate/build the API and operations artifacts without invoking a local database package or migration filter.

**Why:** PolarLogix runtime persistence is Supabase-only, so legacy local database commands can match no workspace and fail an otherwise healthy merge.

**How to apply:** Keep the configured setup idempotent and non-interactive; apply Supabase schema changes through the supported Supabase workflow, then run scoped artifact typechecks and builds in post-merge validation.