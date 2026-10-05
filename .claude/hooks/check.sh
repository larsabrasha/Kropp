#!/bin/sh
# Stop hook: runs npm run check before Claude ends a turn in which files changed. On failure it
# exits 2, which hands the output back to Claude to fix. It blocks once per turn only
# (stop_hook_active), so a check that cannot pass, like a broken install, never loops.
input=$(cat)
if printf '%s' "$input" | grep -Eq '"stop_hook_active" *: *true'; then exit 0; fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if [ -z "$(git status --porcelain)" ]; then exit 0; fi

if ! output=$(npm run check 2>&1); then
  printf 'npm run check failed. Fix it before you finish, or say why it cannot pass.\n\n%s\n' \
    "$(printf '%s' "$output" | tail -n 80)" >&2
  exit 2
fi
