#!/usr/bin/env bash
# Expose the local G Cards EU server on HTTPS for iPhone Safari.
# Usage: PORT=3847 ./scripts/phone-tunnel.sh
set -euo pipefail
PORT="${PORT:-8787}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${CLOUDFLARED_BIN:-$ROOT/.tools/cloudflared}"

if [[ ! -x "$BIN" ]]; then
  mkdir -p "$ROOT/.tools"
  echo "Downloading cloudflared…"
  curl -fsSL -o "$BIN" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$BIN"
fi

echo "Tunneling http://127.0.0.1:${PORT} → public HTTPS for iPhone"
echo "Using HTTP/2 (more reliable on mobile 5G than QUIC/UDP)."
echo "Copy the HTTPS URL into Safari (not 127.0.0.1)."
echo "Optional: PUBLIC_BASE_URL=<that-url> PORT=${PORT} npm start"
# http2: many mobile carriers break Cloudflare QUIC tunnels on 5G
exec "$BIN" tunnel --protocol http2 --url "http://127.0.0.1:${PORT}"
