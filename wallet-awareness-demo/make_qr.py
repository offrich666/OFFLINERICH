#!/usr/bin/env python3
"""Regenerate a Trust Wallet open_url QR for your hosted demo HTTPS URL."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import quote

try:
    import qrcode
except ImportError:
    sys.stderr.write("Install: pip install 'qrcode[pil]'\n")
    raise SystemExit(1)


def main() -> None:
    p = argparse.ArgumentParser(description="Make a Trust deep-link QR for a demo page")
    p.add_argument(
        "https_url",
        help="Public HTTPS URL of index.html (e.g. https://xyz.netlify.app/)",
    )
    p.add_argument(
        "-o",
        "--out",
        default="03-my-hosted-demo-deeplink.png",
        help="Output PNG path",
    )
    args = p.parse_args()

    if not args.https_url.startswith("https://"):
        raise SystemExit("URL must start with https:// (Trust / mobile need TLS)")

    payload = (
        "https://link.trustwallet.com/open_url"
        f"?coin_id=60&url={quote(args.https_url, safe='')}"
    )
    out = Path(args.out)
    qrcode.make(payload, box_size=8, border=2).save(out)
    out.with_suffix(".txt").write_text(payload + "\n", encoding="utf-8")
    print("Wrote", out.resolve())
    print(payload)


if __name__ == "__main__":
    main()
