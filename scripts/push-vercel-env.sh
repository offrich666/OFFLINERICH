#!/usr/bin/env bash
# Requires: vercel login OR VERCEL_TOKEN
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env.local ]]; then echo "missing .env.local"; exit 1; fi
if [[ -z "${VERCEL_TOKEN:-}" ]] && ! npx vercel whoami >/dev/null 2>&1; then
  echo "Set VERCEL_TOKEN or run: npx vercel login"; exit 1
fi
TOKEN_ARGS=()
[[ -n "${VERCEL_TOKEN:-}" ]] && TOKEN_ARGS+=(--token "$VERCEL_TOKEN")

# Ensure project linked
npx vercel link --yes "${TOKEN_ARGS[@]}" || true

set_env() {
  local key="$1" val="$2"
  printf '%s' "$val" | npx vercel env add "$key" production "${TOKEN_ARGS[@]}" --force 2>/dev/null \
    || printf '%s' "$val" | npx vercel env add "$key" production "${TOKEN_ARGS[@]}"
}

while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  case "$key" in
    NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_PRICE_ID|NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL|OPS_SECRET)
      echo "Setting $key"
      set_env "$key" "$val"
      ;;
  esac
done < .env.local

# Force production URL
set_env NEXT_PUBLIC_APP_URL "https://www.walletchainsign.com"

echo "Deploying…"
npx vercel --prod --yes "${TOKEN_ARGS[@]}"
echo "Add domain: npx vercel domains add www.walletchainsign.com ${TOKEN_ARGS[*]}"
