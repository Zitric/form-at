// Transitional re-export — the canonical source moved to packages/data/src/sets.ts
// so apps/admin can read the same catalogue without duplicating it. Kept as a
// shim here (rather than sweeping all ~33 `~/data/sets` import sites across
// apps/web to `@form-at/data/sets` directly) to keep this migration scoped to
// standing up apps/admin, not an unrelated mechanical rename. See TECH_DEBT.md
// item 21 for the proposed follow-up sweep.
export * from "@form-at/data/sets";
