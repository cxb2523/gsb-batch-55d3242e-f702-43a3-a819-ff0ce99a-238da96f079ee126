#!/bin/zsh
# Install the repo's git hooks into this checkout.
#
# `.git/hooks/` is not versioned, so a hook that only exists there protects one clone and nobody
# knows it is missing anywhere else. Run once per checkout: scripts/hooks/install.sh
#
# The hooks live in the COMMON dir, not in `.git`: a worktree's `.git` is a file, and editing it
# as a path is how this script used to fail with "cp: .git/hooks/pre-commit: Not a directory" in
# every worktree — which is most of where this project is worked on.
set -e
cd "$(dirname "$0")/../.."
hooks="$(git rev-parse --git-common-dir)/hooks"
mkdir -p "$hooks"
for hook in scripts/hooks/*(N); do
  [[ "${hook:t}" == "install.sh" ]] && continue
  cp "$hook" "$hooks/${hook:t}"
  chmod +x "$hooks/${hook:t}"
  echo "installed ${hook:t}"
done
# pre-push merged into pre-commit on 2026-10-27. A copy left behind still runs the full check at
# push time, which is the wait that merge removed — so installing also has to un-install it.
rm -f "$hooks/pre-push"
