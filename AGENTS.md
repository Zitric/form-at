# AGENTS.md

Agent instructions for this repo live in **[`CLAUDE.md`](CLAUDE.md)** — read it
before making changes. It is the single source; nothing is duplicated here,
because two copies of a convention drift and then one of them is wrong.

Read in this order:

1. **Hard constraints** (§1) — one line each for the things that break production or regress silently. The `schema.sql` migration rule and the service-worker rules have each already caused a real incident.
2. **Workflow** (§2) — branch per task, stage by name, commits authored as the repo owner with no attribution, PRs merged only by the repo owner; Cloudflare resources are provisioned by hand.
3. **Code standards** (§3), **where things live** (§4), **commands** (§5) as the task needs.

The full reasoning behind each constraint, and the per-area detail, is in
**[`.claude/rules/`](.claude/rules/)**: each file starts with a `paths:` list
saying which files it covers. Before editing a file, read every rule whose paths
match it. Step-by-step procedures (handoff, opening a PR, adding a DJ or an
event, a D1 migration) are in `.claude/skills/*/SKILL.md`.

`README.md` covers what the project is and why it's built this way.
