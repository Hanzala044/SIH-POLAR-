---
name: PolarLogix demo access boundary
description: Security boundary for the one-click development demo.
---

The one-click preview is a local, read-only view of fabricated fixture data. It does not create a Clerk session, call protected operations endpoints, or authorize server commands; the entry point is development-only.

**Why:** Shared credentials and client-side authentication bypasses would weaken the four-role server-enforced RBAC model and could expose live operational data.

**How to apply:** Keep the demo isolated from `useOperations()` and protected API clients, label all values as illustrative, disable command controls, and keep the demo entry out of production. If real demo accounts are ever needed, provision distinct accounts through the identity provider rather than embedding credentials.