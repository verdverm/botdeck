#!/usr/bin/env bash
#
# kill-dangling-servers.sh
#
# Clean up dev servers left dangling by agent sessions: the vermbot agent + file
# API (tsx/node on :8787), the botdeck dashboard (vite on :5173), and their
# orphaned "pnpm dev" / "pnpm --filter ... dev" orchestrator chains.
#
# It is safe to re-run: if nothing is running it prints a one-line status and
# exits 0. It only ever kills processes that belong to THIS repo, identified two
# ways and combined:
#   1. processes LISTENING on the dev ports, and
#   2. processes whose command line matches this project's dev tooling
#      (pnpm dev / pnpm --filter <pkg> dev / tsx ... src/server.ts / vite) AND
#      whose working directory is inside the repo.
# From those roots it also collects their descendant processes (server workers,
# esbuild, ...) and climbs to ancestor orchestrators, but it STOPS at any shell,
# login, editor, or launchd boundary so interactive sessions and unrelated tools
# (e.g. the editor's tsserver) are never touched.
#
# Usage:
#   scripts/kill-dangling-servers.sh            # kill dangling dev servers
#   scripts/kill-dangling-servers.sh --dry-run  # report only, kill nothing
#   scripts/kill-dangling-servers.sh --ports 8787 5173 4321
#
# (no `set -u`: this script leans on associative arrays, and bash 5.3 trips
#  "${#A[@]}" on an empty assoc array under nounset; every var is initialised.)
set -o pipefail

DRY_RUN=0
PORTS=("8787" "5173")

# Dev command signatures that belong to this project's tooling. Matched against
# the full command line (ps args). Deliberately narrow to avoid collateral.
# The src/server\.ts token is reliable: only vermbot's dev/start server uses it
# (botdeck is vite), and repo-cwd ownership is still required separately.
DEV_PATTERNS='(pnpm[[:space:]]+(--parallel[[:space:]]+)?(--filter[[:space:]]+(botdeck|vermbot)[[:space:]]+)*dev(:vermbot|:botdeck)?|tsx([[:space:]]+[^[:space:]]+)*[[:space:]]src/server\.ts|loader\.mjs[[:space:]]+src/server\.ts|(^|[[:space:]])vite([[:space:]]|$)|vitepress|esbuild.*--service)'

# Ancestor boundaries we never kill or climb past: interactive/login shells,
# terminals, editors, process managers, and launchd/systemd.
STOP_PATTERNS='(^|/)(bash|zsh|sh|dash|fish|ksh|login|sshd|tmux|screen|script|Terminal|iTerm|Code|Cursor|Windsurf|JetBrains|idea|WebStorm|launchd|systemd)$|^-'

usage() {
  sed -n '2,30p' "$0" | sed 's/^#//'
  exit "${1:-0}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1 ;;
    --ports) shift; PORTS=(); while [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; do PORTS+=("$1"); shift; done; continue ;;
    -h|--help) usage 0 ;;
    *) printf 'unknown option: %s\n' "$1" >&2; usage 2 ;;
  esac
  shift
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SELF_PID="$$"
SELF_PPID="${PPID:-0}"

command -v lsof >/dev/null 2>&1 || { printf 'error: lsof is required but not on PATH\n' >&2; exit 1; }

# --- snapshot of all processes: pid -> ppid, pid -> args ----------------------
declare -A PARENT ARGS
SNAP="$(ps -A -o pid= -o ppid= -o args=)"
while read -r pid ppid rest; do
  [ -n "${pid:-}" ] || continue
  PARENT["$pid"]="$ppid"
  ARGS["$pid"]="$rest"
done <<<"$SNAP"

# --- helpers ------------------------------------------------------------------
proc_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1; }

is_descendant_of_repo() {
  # true when the given cwd path is the repo root or under it.
  local cwd="$1"
  [ -n "$cwd" ] || return 1
  case "$cwd" in
    "$REPO_ROOT"|"$REPO_ROOT"/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_stoppable_root() {
  local pid="$1" args="$2"
  # never target ourselves or init
  [ "$pid" = "$SELF_PID" ] && return 1
  [ "$pid" = "1" ] && return 1
  # must match a dev command signature
  printf '%s' "$args" | grep -Eq "$DEV_PATTERNS" || return 1
  # must belong to this repo via working directory
  is_descendant_of_repo "$(proc_cwd "$pid")"
}

add_target() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  [ -n "${TARGETS[$pid]:-}" ] && return 0
  TARGETS["$pid"]=1
}

# --- find roots: port listeners + matching repo dev processes -----------------
declare -A TARGETS
declare -A FOREIGN   # pids LISTENING on a dev port that we cannot attribute to
                     # this repo: reported but never killed, so an unrelated user
                     # service on the same port is left alone.
PORT_PIDS=""
for port in "${PORTS[@]}"; do
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u | tr '\n' ' ')"
  for pid in $pids; do
    [ -n "$pid" ] || continue
    PORT_PIDS="$PORT_PIDS $pid"
    args="${ARGS[$pid]:-}"
    if is_stoppable_root "$pid" "$args"; then
      add_target "$pid"
    else
      FOREIGN["$pid"]="$args"
    fi
  done
done

for pid in "${!ARGS[@]}"; do
  is_stoppable_root "$pid" "${ARGS[$pid]}" && add_target "$pid"
done

# --- build a parent->children map from the snapshot (for closure) -------------
declare -A CHILDREN
for pid in "${!PARENT[@]}"; do
  p="${PARENT[$pid]}"
  [ -n "$p" ] || continue
  CHILDREN["$p"]="${CHILDREN[$p]:-} $pid"
done

# --- closure: descendants of every target + guarded ancestor climb ------------
# Descendants are always pulled in (server workers, esbuild, vite children).
collect_descendants() {
  local pid="$1"
  local c
  for c in ${CHILDREN["$pid"]:-}; do
    [ -n "$c" ] || continue
    [ "${TARGETS[$c]:-}" = 1 ] && continue
    add_target "$c"
    collect_descendants "$c"
  done
}

# Ancestors are pulled in only while they are repo dev tooling; we stop at any
# shell/editor/launchd boundary so interactive sessions survive.
collect_ancestors() {
  local pid="$1" p
  while :; do
    p="${PARENT[$pid]:-}"
    [ -n "$p" ] || break
    [ "$p" = "1" ] && break
    [ "$p" = "$SELF_PID" ] || [ "$p" = "$SELF_PPID" ] && break
    local pargs="${ARGS[$p]:-}"
    [ -n "$pargs" ] || break
    # boundary: never climb into a shell/terminal/editor/login
    if printf '%s' "$pargs" | grep -Eq "$STOP_PATTERNS"; then break; fi
    # only climb repo dev orchestrators; otherwise stop
    is_stoppable_root "$p" "$pargs" || break
    add_target "$p"
    pid="$p"
  done
}

for t in "${!TARGETS[@]}"; do
  collect_descendants "$t"
  collect_ancestors "$t"
done

# --- report -------------------------------------------------------------------
printf 'repo root : %s\n' "$REPO_ROOT"
printf 'ports     : %s\n' "${PORTS[*]}"
printf 'dry-run   : %s\n\n' "$([ "$DRY_RUN" = 1 ] && echo yes || echo no)"

if [ "${#FOREIGN[@]}" -gt 0 ]; then
  printf 'listening on dev ports but NOT attributed to this repo (left untouched):\n'
  for pid in "${!FOREIGN[@]}"; do
    [ "${TARGETS[$pid]:-}" = 1 ] && continue
    printf '  pid %-7s %s\n' "$pid" "${FOREIGN[$pid]}"
  done
  echo
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  printf 'no dangling dev servers found.\n'
  exit 0
fi

# sort pids numerically for stable output
mapfile -t SORTED < <(printf '%s\n' "${!TARGETS[@]}" | sort -n)

printf 'targeting %d process(es):\n' "${#SORTED[@]}"
for pid in "${SORTED[@]}"; do
  printf '  pid %-7s ppid %-7s %s\n' "$pid" "${PARENT[$pid]:-?}" "${ARGS[$pid]:-}"
done
echo

if [ "$DRY_RUN" = 1 ]; then
  printf 'dry-run: nothing killed.\n'
else
  # TERM first (lets tsx/vite clean up), then a short grace, then KILL stragglers.
  for pid in "${SORTED[@]}"; do kill -TERM "$pid" 2>/dev/null; done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    alive=0
    for pid in "${SORTED[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 0.2
  done
  for pid in "${SORTED[@]}"; do kill -KILL "$pid" 2>/dev/null; done
  printf 'killed %d process(es).\n' "${#SORTED[@]}"
fi

# --- port status after --------------------------------------------------------
echo
for port in "${PORTS[@]}"; do
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u | tr '\n' ' ')"
  if [ -n "$pids" ]; then
    printf ':%s still LISTENING (pids:%s)\n' "$port" "$pids"
  else
    printf ':%s free\n' "$port"
  fi
done

# --- safety: flag anything still alive in our target set (real runs only) -----
if [ "$DRY_RUN" != 1 ]; then
  still=0
  for pid in "${SORTED[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then printf 'warning: pid %s still alive\n' "$pid" >&2; still=1; fi
  done
  [ "$still" = 1 ] && exit 1
fi
exit 0
