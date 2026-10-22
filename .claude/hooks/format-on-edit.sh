#!/usr/bin/env bash
# PostToolUse hook for the edit tools: runs `biome check --write` on the one
# file just edited. Silent on success. When Biome reports something it can't
# fix, exit 2 puts its output in front of Claude (PostToolUse can't undo the
# edit; it only reports).

set -u

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.jsonc | *.css) ;;
  *) exit 0 ;;
esac
# Generated or vendored: Biome ignores most of these via biome.json, and
# formatting a generated file only produces churn.
case "$file" in
  */node_modules/* | */dist/* | */storybook-static/* | */routeTree.gen.ts | */sets.generated.ts) exit 0 ;;
esac

biome="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/biome"
[ -x "$biome" ] || exit 0

if ! out=$("$biome" check --write --no-errors-on-unmatched "$file" 2>&1); then
  printf 'biome check left problems in %s:\n%s\n' "$file" "$out" >&2
  exit 2
fi
exit 0
