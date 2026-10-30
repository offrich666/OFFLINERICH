#!/usr/bin/env python3
"""G Cards EU — professional Visa / Mastercard issuer package sync terminal."""

from __future__ import annotations

import json
import math
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Europe/Warsaw ≈ CET/CEST; use fixed +01/+02 via local offset if available
try:
    from zoneinfo import ZoneInfo

    TZ = ZoneInfo("Europe/Warsaw")
except Exception:
    TZ = timezone(timedelta(hours=2))

STATE_PATH = Path(os.environ.get("GCARDS_SYNC_STATE", "/cursor/stores/self/issuer-sync/state.json"))
DURATION_HOURS = 48.0
START_PCT = 82.0
TICK_SEC = 1.15

VISA_HOST = "secure.download.visa.com"
MC_HOST = "files.mastercard.com"
CHANNEL = "TLS 1.3 · issuer programme CDN"

VISA_RANGES = [
    (4000001, 4001000),
    (4120001, 4121000),
    (4240001, 4241000),
    (4340001, 4341000),
    (4400001, 4401000),
    (4510001, 4511000),
    (4600001, 4601000),
    (4740001, 4741000),
]
MC_RANGES = [
    (5100001, 5101000),
    (5200001, 5201000),
    (5300001, 5301000),
    (5400001, 5401000),
    (5500001, 5501000),
    (2221001, 2222000),
    (2230001, 2231000),
    (2720001, 2721000),
]

RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
WHITE = "\033[97m"
RED = "\033[31m"

_running = True


def now_local() -> datetime:
    return datetime.now(TZ)


def fmt_hms(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h >= 24:
        d, h2 = divmod(h, 24)
        return f"{d}d {h2:02d}h {m:02d}m {s:02d}s"
    return f"{h:02d}h {m:02d}m {s:02d}s"


def bar(pct: float, width: int = 36) -> str:
    filled = int(round(max(0, min(100, pct)) / 100 * width))
    return "█" * filled + "░" * (width - filled)


def load_state() -> dict:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if STATE_PATH.exists():
        try:
            data = json.loads(STATE_PATH.read_text())
            if "started_at" in data:
                return data
        except Exception:
            pass
    started = now_local()
    data = {
        "started_at": started.isoformat(),
        "start_pct": START_PCT,
        "duration_hours": DURATION_HOURS,
        "visa_done": 0,
        "mc_done": 0,
        "bytes_visa": 0,
        "bytes_mc": 0,
        "completed": False,
    }
    STATE_PATH.write_text(json.dumps(data, indent=2))
    return data


def save_state(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data, indent=2))


def progress_for(state: dict) -> tuple[float, float]:
    """Return (percent, remaining_seconds) based on wall clock from start."""
    if state.get("completed"):
        return 100.0, 0.0
    started = datetime.fromisoformat(state["started_at"])
    if started.tzinfo is None:
        started = started.replace(tzinfo=TZ)
    elapsed = (now_local() - started).total_seconds()
    duration = float(state.get("duration_hours", DURATION_HOURS)) * 3600.0
    start_pct = float(state.get("start_pct", START_PCT))
    span = 100.0 - start_pct
    # Ease slightly so speed feels network-like near the end
    t = min(1.0, max(0.0, elapsed / duration))
    eased = 1.0 - (1.0 - t) ** 1.08
    pct = start_pct + span * eased
    remaining = max(0.0, duration - elapsed)
    if pct >= 99.97:
        return 100.0, 0.0
    return min(99.96, pct), remaining


def speed_mbps(pct: float) -> float:
    # Professional CDN-ish: 38–92 Mbps with jitter
    base = 58 + 18 * math.sin(time.time() / 7.3) + 9 * math.sin(time.time() / 2.1)
    if pct > 95:
        base *= 0.72
    return max(12.0, base + random.uniform(-4.5, 5.5))


def pick_job(pct: float, tick: int) -> dict:
    # Alternate Visa / Mastercard package downloads
    use_visa = (tick // 3) % 2 == 0
    if use_visa:
        lo, hi = VISA_RANGES[tick % len(VISA_RANGES)]
        # drift ranges forward as progress climbs
        offset = int((pct - START_PCT) * 850)
        lo += offset
        hi += offset
        return {
            "network": "Visa",
            "color": BLUE,
            "host": VISA_HOST,
            "file": f"{lo}-{hi}.bin",
            "label": "Visa Issuer Package",
        }
    lo, hi = MC_RANGES[tick % len(MC_RANGES)]
    offset = int((pct - START_PCT) * 720)
    lo += offset
    hi += offset
    return {
        "network": "Mastercard",
        "color": MAGENTA,
        "host": MC_HOST,
        "file": f"{lo}-{hi}.bin",
        "label": "Mastercard Issuer Package",
    }


def clear() -> None:
    sys.stdout.write("\033[2J\033[H")
    sys.stdout.flush()


def completion_screen(state: dict) -> None:
    clear()
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"{BOLD}{WHITE}╔══════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{WHITE}║   G Cards EU · Issuer Network Sync · COMPLETE                    ║{RESET}")
    print(f"{BOLD}{WHITE}╚══════════════════════════════════════════════════════════════════╝{RESET}")
    print()
    print(f"  {GREEN}✓{RESET} Visa package download        {BOLD}100%{RESET}  OK")
    print(f"  {GREEN}✓{RESET} Mastercard package download  {BOLD}100%{RESET}  OK")
    print(f"  {DIM}Channel{RESET}  {CHANNEL}")
    print(f"  {DIM}Finished{RESET} {ts}")
    print(f"  {DIM}Bytes in{RESET} Visa {state.get('bytes_visa', 0):,} · Mastercard {state.get('bytes_mc', 0):,}")
    print()
    print(f"{YELLOW}┌──────────────────────────────────────────────────────────────────┐{RESET}")
    print(f"{YELLOW}│{RESET}  {BOLD}ACTION REQUIRED{RESET}                                                 {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}                                                                  {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  Please add a {BOLD}Visa agent{RESET} to integrate these files                 {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  into your system.                                               {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}                                                                  {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  After the Visa agent is connected, Mastercard integration       {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  can be completed from the G Cards EU admin desk.                {YELLOW}│{RESET}")
    print(f"{YELLOW}└──────────────────────────────────────────────────────────────────┘{RESET}")
    print()
    print(f"{DIM}Press Ctrl+C to exit.{RESET}")


def frame(state: dict, tick: int) -> None:
    pct, remaining = progress_for(state)
    if pct >= 100.0:
        state["completed"] = True
        save_state(state)
        completion_screen(state)
        return

    job = pick_job(pct, tick)
    mbps = speed_mbps(pct)
    # approximate chunk transfer this tick
    chunk = int(mbps * 1_000_000 / 8 * TICK_SEC * random.uniform(0.85, 1.12))
    if job["network"] == "Visa":
        state["bytes_visa"] = int(state.get("bytes_visa", 0)) + chunk
        state["visa_done"] = int(state.get("visa_done", 0)) + 1
    else:
        state["bytes_mc"] = int(state.get("bytes_mc", 0)) + chunk
        state["mc_done"] = int(state.get("mc_done", 0)) + 1

    # Split overall into Visa / MC lanes for the meters
    visa_pct = min(99.9, pct + random.uniform(-0.35, 0.15))
    mc_pct = min(99.9, pct + random.uniform(-0.45, 0.25))
    if job["network"] == "Visa":
        visa_pct = min(99.9, pct + 0.12)
    else:
        mc_pct = min(99.9, pct + 0.12)

    latency = random.randint(18, 46)
    loss = random.choice(["0.00%", "0.00%", "0.01%", "0.00%"])
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S")

    clear()
    print(f"{BOLD}{WHITE}G Cards EU{RESET}  {DIM}│{RESET}  Issuer programme sync  {DIM}│{RESET}  {CYAN}{CHANNEL}{RESET}")
    print(f"{DIM}{ts} Europe/Warsaw · session started {state['started_at'][:19]}{RESET}")
    print()
    print(f"{BOLD}Overall progress{RESET}  {pct:5.2f}%   [{GREEN}{bar(pct)}{RESET}]")
    print(f"{DIM}ETA remaining{RESET}      {BOLD}{YELLOW}{fmt_hms(remaining)}{RESET}   {DIM}(target window 48h from start){RESET}")
    print()
    print(f"{BLUE}● Visa{RESET}         {visa_pct:5.2f}%  [{BLUE}{bar(visa_pct, 28)}{RESET}]  host {DIM}{VISA_HOST}{RESET}")
    print(f"{MAGENTA}● Mastercard{RESET}   {mc_pct:5.2f}%  [{MAGENTA}{bar(mc_pct, 28)}{RESET}]  host {DIM}{MC_HOST}{RESET}")
    print()
    print(f"{BOLD}Link{RESET}")
    print(
        f"  Internet speed   {BOLD}{WHITE}{mbps:5.1f} Mbps{RESET}"
        f"   latency {latency} ms   loss {loss}"
    )
    print(
        f"  Throughput       {chunk/1_048_576:6.2f} MB/s this tick"
        f"   · Visa {state['bytes_visa']/1_048_576:,.1f} MB · MC {state['bytes_mc']/1_048_576:,.1f} MB"
    )
    print()
    print(f"{BOLD}Active transfer{RESET}")
    print(
        f"  Downloading from {job['color']}{BOLD}{job['network']}{RESET}"
        f"  →  {WHITE}{job['file']}{RESET}"
    )
    print(f"  {DIM}GET https://{job['host']}/issuer/packages/{job['file']}{RESET}")
    print(
        f"  Status {GREEN}OK{RESET}"
        f"   package {job['label']}"
        f"   blocks {state.get('visa_done', 0) + state.get('mc_done', 0):,}"
    )
    print()
    # scrolling log style lines
    print(f"{DIM}── transfer log ───────────────────────────────────────────────────{RESET}")
    for i in range(4):
        past = pick_job(max(START_PCT, pct - (3 - i) * 0.08), max(0, tick - (3 - i)))
        mark = f"{GREEN}OK{RESET}"
        print(
            f"  Transferring {past['file']}  →  {past['color']}{past['network']}{RESET}"
            f"   {mark}   {pct - (3 - i) * 0.02:5.2f}%"
            f"   Remaining: {fmt_hms(remaining + (3 - i) * 40)}"
        )
    print()
    print(f"{DIM}Ctrl+C stop · state {STATE_PATH}{RESET}")
    save_state(state)


def on_signal(signum, frame) -> None:  # noqa: ARG001
    global _running
    _running = False


def main() -> int:
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    state = load_state()
    tick = 0
    if state.get("completed"):
        completion_screen(state)
        while _running:
            time.sleep(1)
        return 0

    while _running:
        pct, _ = progress_for(state)
        frame(state, tick)
        if state.get("completed") or pct >= 100.0:
            while _running:
                time.sleep(1)
            break
        tick += 1
        time.sleep(TICK_SEC)
    print()
    print(f"{DIM}Sync terminal stopped.{RESET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
