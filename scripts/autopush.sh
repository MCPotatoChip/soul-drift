#!/usr/bin/env bash
# Commit and push local changes so Vercel (connected to the GitHub repo) redeploys.
#
#   autopush.sh debounce   wait for a quiet moment (8 s) after the last call, then push
#   autopush.sh now        push immediately (used when a Claude turn ends)
#
# Safe by design: it never force-pushes, skips the push if any changed JavaScript file
# fails a syntax check (so a half-finished edit is never deployed), and does nothing
# when AUTOPUSH=off or the folder has no `origin` remote.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}" || exit 0
[ "${AUTOPUSH:-on}" = "off" ] && exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
git remote get-url origin >/dev/null 2>&1 || exit 0

GITDIR="$(git rev-parse --git-dir)"
LOG="$GITDIR/autopush.log"
STAMP="$GITDIR/autopush.stamp"
DELAY="${AUTOPUSH_DELAY:-8}"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }

flush() {
  # one push at a time
  exec 9>"$GITDIR/autopush.lock"
  flock -w 60 9 || { log "lock busy, skipped"; return 0; }

  git add -A
  if git diff --cached --quiet; then
    # nothing new to commit, but a previous push may have failed
    if [ -n "$(git log '@{u}..HEAD' --oneline 2>/dev/null)" ]; then
      git push -q origin HEAD >>"$LOG" 2>&1 && log "pushed pending commits" || log "push failed"
    fi
    return 0
  fi

  # never deploy JavaScript that does not parse
  local bad=0 f
  while IFS= read -r f; do
    case "$f" in *.js) node --check "$f" >>"$LOG" 2>&1 || { log "syntax error in $f, not pushing"; bad=1; } ;; esac
  done < <(git diff --cached --name-only --diff-filter=ACM)
  if [ "$bad" = 1 ]; then git reset -q; return 0; fi

  local files msg
  files="$(git diff --cached --name-only | head -5 | xargs -n1 basename | paste -sd, -)"
  msg="Update ${files}"
  git commit -q -m "$msg" -m "Auto-committed by scripts/autopush.sh" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" >>"$LOG" 2>&1 || { log "commit failed"; return 0; }
  if git push -q origin HEAD >>"$LOG" 2>&1; then
    log "pushed: $msg"
  else
    git pull -q --rebase --autostash origin "$(git rev-parse --abbrev-ref HEAD)" >>"$LOG" 2>&1 \
      && git push -q origin HEAD >>"$LOG" 2>&1 && log "pushed after rebase: $msg" || log "push failed: $msg"
  fi
}

case "${1:-now}" in
  debounce)
    my="$(date +%s%N)"
    echo "$my" >"$STAMP"
    # detach so the hook returns at once; only the last call in a burst proceeds
    ( sleep "$DELAY"; [ "$(cat "$STAMP" 2>/dev/null)" = "$my" ] && "$0" now ) >/dev/null 2>&1 </dev/null &
    disown 2>/dev/null || true
    ;;
  *) flush ;;
esac
exit 0
