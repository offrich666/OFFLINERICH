#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/target/release/vanity-mint"
URL="http://127.0.0.1:4173"
if [[ ! -x "$BIN" ]]; then
  echo "Build the app first: cargo build --release --manifest-path $ROOT/Cargo.toml" >&2
  exit 1
fi
if ! curl -sf -o /dev/null "$URL/health"; then
  if command -v tmux >/dev/null 2>&1; then
    TMUX_CONF=()
    if [[ -f /exec-daemon/tmux.portal.conf ]]; then
      TMUX_CONF=(-f /exec-daemon/tmux.portal.conf)
    fi
    if ! tmux "${TMUX_CONF[@]}" has-session -t vanity-mint 2>/dev/null; then
      tmux "${TMUX_CONF[@]}" new-session -d -s vanity-mint -c "$ROOT" -- "$BIN"
    fi
  else
    nohup "$BIN" >"$ROOT/reservations/server.log" 2>&1 &
  fi
  for _ in $(seq 1 50); do
    curl -sf -o /dev/null "$URL/health" && break
    sleep 0.1
  done
fi
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --app="$URL" --no-first-run --disable-session-crashed-bubble >/dev/null 2>&1 &
elif command -v google-chrome-stable >/dev/null 2>&1; then
  google-chrome-stable --app="$URL" --no-first-run >/dev/null 2>&1 &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --app="$URL" >/dev/null 2>&1 &
else
  xdg-open "$URL" >/dev/null 2>&1 &
fi
