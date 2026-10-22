---
name: d1-migration
description: Print the one-statement-at-a-time wrangler commands that migrate the remote form-at-analytics D1 database to match apps/web/schema.sql. Prints commands for the repo owner to run; never runs them.
disable-model-invocation: true
argument-hint: "[table or column, optional]"
---

# D1 migration (prints, never runs)

Cloudflare writes are the repo owner's. This skill only produces commands.

## Why one statement at a time

- `apps/web/schema.sql` holds `ALTER TABLE`s that aren't idempotent: re-running
  one fails with a duplicate-column error.
- D1 rejects `ADD COLUMN IF NOT EXISTS` (`near "EXISTS": syntax error`).
- So never `--file` the schema against the remote database. `guard-bash.sh`
  blocks that.

## Steps

1. Read `apps/web/schema.sql` in full, including its comments recording which
   statements are already applied in production.
2. The current remote shape is read-only to fetch. Print it for the repo owner,
   or run it if they ask:
   ```bash
   npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(<table>)"
   ```
3. List the statements not yet applied (narrowed to `$ARGUMENTS` if given). For
   each one, print a pair:
   ```bash
   npx wrangler d1 execute form-at-analytics --remote --command "ALTER TABLE <table> ADD COLUMN <col> <type>"
   npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(<table>)"
   ```
   The second line verifies the first before moving on.
4. Draft the `schema.sql` comment update that marks them applied, to commit
   once the repo owner confirms they ran.
5. If a column feeds the catalogue, remind them that CI's `sets-snapshot` job
   compares live D1 with `sets.generated.ts`.
