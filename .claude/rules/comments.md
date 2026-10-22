---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.css"
  - "**/*.sql"
  - ".github/workflows/**"
---

# Comment register

A comment states a **present-tense fact about the code**, not an event that
happened to it. History lives in git and `PWA_PROGRESS.md`, which carry it better
and don't rot. This is the convention most likely to be reintroduced by accident.
Comments are in English.

**Never write into a comment:**
- PR or review references — `(PR4)`, `PR6 review item 5`, `Post-review fix:`, `caught one review pass later`.
- Dates and dated verification — `(2026-08-02)`, `verified against MDN, 2026-07-21`, `CDP-reproduced`.
- Before/after narration — "was ~50px over", "used to".
- Internal shorthand indices — `M1`, `H2`, `chunk 3b`, `Phase 1/2/3/4`, `Step 5`. Pure pointers with no content: a reader can't even guess what `(M1)` meant.
- Feature-provenance tags — `Set-upload feature (PR4) — …`. These age in one direction: code gets reused, the tag doesn't, so a util serving three features still claims to belong to one. Eventually not noise but **wrong**. Apply uniformly — per-file judgement leaves a repo where nobody can infer the convention.
- Arguing with a past reviewer or a deleted comment.
- Speculative future phases — "Phase 2 will shrink the player".
- AI or tool attribution of any kind.

**The rewrite rule.** "PR4 review found X was wrong, so we now do Y" becomes "Y,
because X would otherwise happen." Same information, no dependency on knowing
what PR4 was. Prefer imperatives for traps: *never gitignore this*, *don't
tighten this match*, *keep these two in step*.

**Always keep:**
- Anything that stops a plausible wrong edit — every "don't remove this", "deliberately NOT", and named failure-mode-if-you-change-this. `apps/admin/app/utils/hostGuard.ts` and `dashboard.tsx`'s no-in-app-auth block are the reference examples; both exist solely to stop someone "fixing" a security control.
- Concrete specifics — `2 ÷ 2`, `~300 rows`, `220MB`, `iPhone SE 375px`. Specificity is the point; don't homogenise into blandness.
- Value-by-value references for a discriminated union, and file headers orienting a reader to a module's purpose. That's API documentation, not volume.
- Pointers **into** `PWA_PROGRESS.md` / `TECH_DEBT.md` by section. Verify the section exists first — a pointer to nothing is worse than no pointer.

**Proportionality.** Comment length scales with how easy it is to break the thing
by editing that line. A subtle guard with a silent failure mode earns its
paragraph; a bytes formatter does not. Never restate what the code plainly says,
and never quote another file's source inline — that copy will rot.

**When deleting a label,** grep for it first: other files may cross-reference it
by name.
