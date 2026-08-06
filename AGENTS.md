# AGENTS.md

Agent instructions for this repo live in **[`CLAUDE.md`](CLAUDE.md)** — read it
before making changes. It is the single source; nothing is duplicated here,
because two copies of a convention drift and then one of them is wrong.

Read in this order:

1. **Hard constraints** (§1) — things that break production or regress silently. The `schema.sql` migration rule and the service-worker rules have each already caused a real incident.
2. **Workflow** (§2) — commits belong to the repo owner; Cloudflare resources are provisioned by hand.
3. **Code standards** (§3), **architecture** (§4), **commands** (§5) as the task needs.

`README.md` covers what the project is and why it's built this way.
