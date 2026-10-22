---
name: new-workspace
description: The documentation steps that are part of adding a new workspace (apps/* or packages/*) or a new script in apps/web/scripts to form-at. Use when creating either.
---

# New workspace or script

The "leave the docs true" test only catches text that became false. It can't
catch a doc that was never written: nothing existing contradicts an absence.
That is how `apps/rum-archiver` shipped, ran on a cron in production and was
deployed by CI while the root README still listed five workspaces. So when a
workspace is **added**, these are part of the work, not follow-up.

## A workspace

1. **A README in the workspace**, if it has any setup, secret, schedule or deploy
   target a reader can't infer from its source. A package that is purely library
   code consumed through an import doesn't need one; anything with an
   operational surface does.
2. **Root `README.md`:** its structure block and its documentation table, the two
   places an outside reader learns the workspace exists.
3. **`CLAUDE.md`:** the workspace table at the top, plus §4's map if there's a
   new area to edit.
4. **`.claude/rules/`:** extend the `paths:` of the rule that applies, or add a
   rule file if the workspace has its own silent-failure rules.
5. **Tooling the repo already enforces:**
   - `vitest` on `^4.1.5` (`.claude/rules/tests.md`).
   - A `knip.json` workspace entry.
   - The CI `static` and `unit` jobs (`.claude/rules/ci.md`).
   - `@form-at/tsconfig` via `workspace:*`.
6. Apps never import each other; shared code goes in `packages/*`.

Cloudflare resources the workspace needs (Pages project, Worker, bindings,
secrets) are created by the repo owner. List them under "Needs from you".

## A script in `apps/web/scripts/`

`apps/web/scripts/README.md` claims to document every script in that folder, so
a new one without an entry makes the README's own framing false. Add its
purpose, flags and setup there, and the `package.json` script name if it has
one.
