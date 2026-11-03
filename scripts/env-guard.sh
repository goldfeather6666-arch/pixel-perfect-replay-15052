#!/usr/bin/env bash
# Refuses .env* files except templates. The platform-generated root .env is
# allowed only while every key in it is a known public (publishable) value.
# Usage: scripts/env-guard.sh staged   (pre-commit)   |   scripts/env-guard.sh tracked   (CI)
set -euo pipefail
mode="${1:-staged}"
if [ "$mode" = "staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files)
fi
public_keys='^(VITE_)?SUPABASE_(URL|PROJECT_ID|PUBLISHABLE_KEY)$'
fail=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base=$(basename "$f")
  case "$base" in
    .env.example|.env.template) continue ;;
    .env|.env.*) ;;
    *) continue ;;
  esac
  if [ "$f" = ".env" ]; then
    if [ "$mode" = "staged" ]; then content=$(git show ":$f"); else content=$(cat "$f"); fi
    bad=$(printf '%s\n' "$content" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | cut -d= -f1 | grep -Ev "$public_keys" || true)
    if [ -z "$bad" ]; then continue; fi
    echo "env-guard: .env contains non-public keys: $(echo $bad)" >&2
  else
    echo "env-guard: refusing env file $f (only .env.example/.env.template allowed)" >&2
  fi
  fail=1
done <<< "$files"
exit $fail
