#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# CDN / githack mirror branch
git push origin "HEAD:gcards-eu-live"

# www.g-cards.eu is GitHub Pages from gh-pages (site root = public/ files flattened)
BUILD="$(node -e "const fs=require('fs');const m=fs.readFileSync('public/desk.html','utf8').match(/desk-build\" content=\"([^\"]+)/); if(!m) process.exit(1); process.stdout.write(m[1]);")"
PAGES_DIR="$(mktemp -d /tmp/gcards-gh-pages-XXXXXX)"
cleanup() { rm -rf "$PAGES_DIR"; }
trap cleanup EXIT

git fetch origin gh-pages
git worktree add --detach "$PAGES_DIR" origin/gh-pages
(
  cd "$PAGES_DIR"
  git checkout -B gh-pages
  cp "$ROOT/public/desk.html" desk.html
  mkdir -p desk
  cp "$ROOT/public/desk/index.html" desk/index.html
  cp "$ROOT/public/app.js" app.js
  cp "$ROOT/public/styles.css" styles.css
  cp "$ROOT/public/site.js" site.js
  cp "$ROOT/public/gg-wallet.js" gg-wallet.js
  if [[ -f "$ROOT/public/index.html" ]]; then cp "$ROOT/public/index.html" index.html; fi
  for f in \
    "desk-app.${BUILD}.js" \
    "desk-styles.${BUILD}.css" \
    "desk-site.${BUILD}.js"
  do
    cp "$ROOT/public/$f" "$f"
  done
  git add -A
  if git diff --cached --quiet; then
    echo "gh-pages already up to date for build ${BUILD}"
  else
    git commit -m "Publish desk ${BUILD} — live GitHub Pages"
    git push origin HEAD:gh-pages
  fi
)
git worktree remove --force "$PAGES_DIR" || true
trap - EXIT

SHA="$(git rev-parse HEAD)"
INDEX="https://rawcdn.githack.com/offrich666/OFFLINERICH/${SHA}/public/index.html"
DESK="https://rawcdn.githack.com/offrich666/OFFLINERICH/${SHA}/public/desk.html"
echo "$INDEX" | tee /opt/cursor/artifacts/gcards_iphone_url.txt
echo "desk: $DESK" | tee -a /opt/cursor/artifacts/gcards_iphone_url.txt
echo "pages: https://www.g-cards.eu/desk (build ${BUILD})" | tee -a /opt/cursor/artifacts/gcards_iphone_url.txt
echo "Permanent iPhone URL (cellular OK): $INDEX"
