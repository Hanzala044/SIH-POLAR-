---
name: Workspace dependency installs
description: Dependency installation behavior for packages inside this pnpm monorepo.
---

Artifact dependencies must be added with a package-scoped install command rather than the generic workspace package helper.

**Why:** The generic helper invokes pnpm at the monorepo root and refuses to add a dependency unless it is explicitly a root dependency, while the artifact package and lockfile need the dependency on their own importer.

**How to apply:** For a dependency used only by one artifact, use the artifact's pnpm filter so both its package manifest and the workspace lockfile are updated.