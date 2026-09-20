---
name: PolarLogix prototype boundary
description: The first PolarLogix build is intentionally local-first for judgeable demos, with a Supabase/PostGIS schema kept ready for production wiring.
---

The prototype uses browser persistence and a shared reactive state layer so emergency cascades, inventory adjustments, personnel status changes, voyage creation, cold-chain anomalies, and offline queueing work without cloud credentials. The production model is documented in the app schema and should preserve the same cross-module event behavior when Supabase CRUD and realtime are added.

**Why:** The hackathon demo needs to remain fully runnable in an isolated preview while still showing a credible path to the edge-cloud architecture described in the requirements.

**How to apply:** Treat the local store as the demo adapter, not the final data contract; when live persistence is added, keep the same state transitions and global emergency banner behavior.