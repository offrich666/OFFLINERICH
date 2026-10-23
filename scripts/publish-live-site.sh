#!/usr/bin/env bash
# Publish current branch tip to gcards-eu-live for the permanent jsDelivr URL.
# https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public/index.html
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
branch="$(git rev-parse --abbrev-ref HEAD)"
git push origin "HEAD:gcards-eu-live"
echo "Published $branch → gcards-eu-live"
echo "Site: https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public/index.html"
echo "Desk: https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public/desk.html"
curl -sS "https://purge.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public/index.html" >/dev/null || true
curl -sS "https://purge.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public/desk.html" >/dev/null || true
