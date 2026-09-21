---
name: Operator live verification
description: Constraints and fallback for verifying the Clerk-protected operations API against live Supabase data.
---

The managed Playwright testing subagent may be unavailable in Free-mode sessions. When that happens, a temporary server-side harness can create a dedicated Clerk development user, create an active session, exercise the bearer-authenticated operations API, query Supabase directly, and clean up the user/session and reversible test mutation. Never persist or print credentials, session tokens, or generated passwords.

**Why:** The application’s critical contract is server-side session protection plus Supabase persistence, while the browser-testing service is an optional platform capability.

**How to apply:** Treat this as evidence for API/session/data persistence only; do not describe it as a browser UI test, and rerun the browser-specific flow when the managed tester is available.