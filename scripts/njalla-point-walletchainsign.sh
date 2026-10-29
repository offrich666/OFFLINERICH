#!/usr/bin/env bash
# Point www.walletchainsign.com at a deploy host via Njalla DNS API.
# Requires: NJALLA_API_TOKEN (njal.la → Settings → API)
# Usage:
#   NJALLA_API_TOKEN=… ./scripts/njalla-point-walletchainsign.sh cname.vercel-dns.com
#   NJALLA_API_TOKEN=… TARGET=cname.vercel-dns.com ./scripts/njalla-point-walletchainsign.sh
set -euo pipefail

DOMAIN="${DOMAIN:-walletchainsign.com}"
NAME="${NAME:-www}"
TARGET="${1:-${TARGET:-}}"
TOKEN="${NJALLA_API_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "Set NJALLA_API_TOKEN (https://njal.la/ → Settings → API)" >&2
  exit 1
fi
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <cname-target-host>" >&2
  exit 1
fi

api() {
  local method="$1"
  local params="$2"
  curl -sS https://njal.la/api/1/ \
    -H "Authorization: Njalla ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Referer: https://njal.la/" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
}

echo "Listing records for ${DOMAIN}…"
LIST=$(api list-records "{\"domain\":\"${DOMAIN}\"}")
echo "$LIST" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2)[:4000])'

python3 - "$DOMAIN" "$NAME" "$TARGET" "$TOKEN" <<'PY'
import json, os, sys, urllib.request

domain, name, target, token = sys.argv[1:5]

def api(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        "https://njal.la/api/1/",
        data=body,
        headers={
            "Authorization": f"Njalla {token}",
            "Content-Type": "application/json",
            "Referer": "https://njal.la/",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

listed = api("list-records", {"domain": domain})
if "error" in listed:
    raise SystemExit(f"list-records failed: {listed}")

records = listed.get("result", {}).get("records") or listed.get("result") or []
if isinstance(records, dict):
    records = records.get("records", [])

www = [r for r in records if str(r.get("name", "")).rstrip(".") in (name, f"{name}.{domain}") and r.get("type") in ("CNAME", "A", "AAAA")]
print("matched", www)

content = target.rstrip(".") + "."
# Njalla sometimes wants without trailing dot — try both via edit
for rec in www:
    rid = rec.get("id")
    typ = rec.get("type")
    print(f"Updating {typ} id={rid} → {content}")
    if typ == "CNAME":
        out = api(
            "edit-record",
            {"domain": domain, "id": rid, "content": content, "ttl": rec.get("ttl") or 10800},
        )
    else:
        # Replace A/AAAA with CNAME: remove then add
        api("remove-record", {"domain": domain, "id": rid})
        out = api(
            "add-record",
            {
                "domain": domain,
                "name": name,
                "type": "CNAME",
                "content": content,
                "ttl": 10800,
            },
        )
    print(json.dumps(out, indent=2)[:2000])

if not www:
    print(f"No www record; adding CNAME {name} → {content}")
    out = api(
        "add-record",
        {
            "domain": domain,
            "name": name,
            "type": "CNAME",
            "content": content,
            "ttl": 10800,
        },
    )
    print(json.dumps(out, indent=2)[:2000])

print("Done. Wait for DNS propagation, then open https://www.walletchainsign.com/checkout")
PY
