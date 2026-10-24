#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git push origin "HEAD:gcards-eu-live"
SHA="$(git rev-parse HEAD)"
INDEX="https://rawcdn.githack.com/offrich666/OFFLINERICH/${SHA}/public/index.html"
DESK="https://rawcdn.githack.com/offrich666/OFFLINERICH/${SHA}/public/desk.html"
echo "$INDEX" | tee /opt/cursor/artifacts/gcards_iphone_url.txt
echo "desk: $DESK" | tee -a /opt/cursor/artifacts/gcards_iphone_url.txt
echo "Permanent iPhone URL (cellular OK): $INDEX"
