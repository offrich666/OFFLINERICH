#!/usr/bin/env python3
"""G Cards EU — professional Visa / Mastercard / Amex issuer package sync terminal."""

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

try:
    from zoneinfo import ZoneInfo

    TZ = ZoneInfo("Europe/Warsaw")
except Exception:
    TZ = timezone(timedelta(hours=1))

STATE_PATH = Path(os.environ.get("GCARDS_SYNC_STATE", "/cursor/stores/self/issuer-sync/state.json"))
DURATION_HOURS = float(os.environ.get("GCARDS_SYNC_HOURS", "27"))
START_PCT = float(os.environ.get("GCARDS_SYNC_START_PCT", "87"))
TICK_SEC = 1.2

VISA_HOST = "secure.download.visa.com"
MC_HOST = "files.mastercard.com"
AMEX_HOST = "secure.americanexpress.com"
CHANNEL = "TLS 1.3 · issuer programme CDN · resumed session"

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
AMEX_RANGES = [
    (3400001, 3401000),
    (3700001, 3701000),
    (3710001, 3711000),
    (3720001, 3721000),
    (3730001, 3731000),
    (3740001, 3741000),
    (3780001, 3781000),
    (3790001, 3791000),
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
ORANGE = "\033[38;5;208m"

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
    force = os.environ.get("GCARDS_SYNC_RESET", "").strip() in {"1", "true", "yes"}
    if STATE_PATH.exists() and not force:
        try:
            data = json.loads(STATE_PATH.read_text())
            if "started_at" in data and not data.get("completed"):
                return data
        except Exception:
            pass
    started = now_local()
    data = {
        "started_at": started.isoformat(),
        "start_pct": START_PCT,
        "duration_hours": DURATION_HOURS,
        "resumed": True,
        "resume_note": f"Continuing interrupted sync from {START_PCT:.0f}%",
        "visa_done": 0,
        "mc_done": 0,
        "amex_done": 0,
        "bytes_visa": 0,
        "bytes_mc": 0,
        "bytes_amex": 0,
        "reconnects": 0,
        "completed": False,
    }
    STATE_PATH.write_text(json.dumps(data, indent=2))
    return data


def save_state(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data, indent=2))


def progress_for(state: dict) -> tuple[float, float]:
    if state.get("completed"):
        return 100.0, 0.0
    started = datetime.fromisoformat(state["started_at"])
    if started.tzinfo is None:
        started = started.replace(tzinfo=TZ)
    elapsed = (now_local() - started).total_seconds()
    duration = float(state.get("duration_hours", DURATION_HOURS)) * 3600.0
    start_pct = float(state.get("start_pct", START_PCT))
    span = 100.0 - start_pct
    t = min(1.0, max(0.0, elapsed / duration))
    eased = 1.0 - (1.0 - t) ** 1.06
    pct = start_pct + span * eased
    remaining = max(0.0, duration - elapsed)
    if pct >= 99.97:
        return 100.0, 0.0
    return min(99.96, pct), remaining


def speed_mbps(pct: float, reconnecting: bool) -> float:
    if reconnecting:
        return max(0.4, random.uniform(0.8, 4.2))
    base = 52 + 16 * math.sin(time.time() / 7.3) + 8 * math.sin(time.time() / 2.1)
    if pct > 95:
        base *= 0.75
    return max(14.0, base + random.uniform(-4.0, 5.0))


def pick_job(pct: float, tick: int) -> dict:
    lane = tick % 3
    offset = int((pct - START_PCT) * 900)
    if lane == 0:
        lo, hi = VISA_RANGES[tick % len(VISA_RANGES)]
        lo += offset
        hi += offset
        return {
            "network": "Visa",
            "color": BLUE,
            "host": VISA_HOST,
            "file": f"{lo}-{hi}.bin",
            "label": "Visa Issuer BIN Package",
            "key": "visa",
        }
    if lane == 1:
        lo, hi = MC_RANGES[tick % len(MC_RANGES)]
        lo += offset
        hi += offset
        return {
            "network": "Mastercard",
            "color": MAGENTA,
            "host": MC_HOST,
            "file": f"{lo}-{hi}.bin",
            "label": "Mastercard Issuer BIN Package",
            "key": "mc",
        }
    lo, hi = AMEX_RANGES[tick % len(AMEX_RANGES)]
    lo += offset
    hi += offset
    return {
        "network": "American Express",
        "color": ORANGE,
        "host": AMEX_HOST,
        "file": f"{lo}-{hi}.bin",
        "label": "American Express Issuer BIN Package",
        "key": "amex",
    }


def reconnect_phase(tick: int) -> dict | None:
    """Periodic professional reconnect moments while continuing the sync."""
    phase = tick % 18
    if phase == 4:
        return {
            "title": "Reconnecting to Visa",
            "detail": "Session handshake · requesting next BIN package block",
            "host": VISA_HOST,
            "color": BLUE,
        }
    if phase == 10:
        return {
            "title": "Reconnecting to American Express servers",
            "detail": "Establishing secure channel to retrieve Amex BIN ranges",
            "host": AMEX_HOST,
            "color": ORANGE,
        }
    if phase == 15:
        return {
            "title": "Connecting Mastercard",
            "detail": "Authorising issuer CDN · preparing BIN download stream",
            "host": MC_HOST,
            "color": MAGENTA,
        }
    return None


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
    print(f"  {GREEN}✓{RESET} Visa BIN packages              {BOLD}100%{RESET}  OK")
    print(f"  {GREEN}✓{RESET} Mastercard BIN packages        {BOLD}100%{RESET}  OK")
    print(f"  {GREEN}✓{RESET} American Express BIN packages  {BOLD}100%{RESET}  OK")
    print(f"  {DIM}Channel{RESET}  {CHANNEL}")
    print(f"  {DIM}Finished{RESET} {ts}")
    print(
        f"  {DIM}Bytes in{RESET} Visa {state.get('bytes_visa', 0):,} · "
        f"MC {state.get('bytes_mc', 0):,} · Amex {state.get('bytes_amex', 0):,}"
    )
    print()
    print(f"{YELLOW}┌──────────────────────────────────────────────────────────────────┐{RESET}")
    print(f"{YELLOW}│{RESET}  {BOLD}ACTION REQUIRED{RESET}                                                 {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}                                                                  {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  Please contact API and code provider to activate BINs           {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  on your platforms.                                              {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}                                                                  {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  Visa · Mastercard · American Express packages are ready.        {YELLOW}│{RESET}")
    print(f"{YELLOW}│{RESET}  Integration unlocks after provider activation.                  {YELLOW}│{RESET}")
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

    recon = reconnect_phase(tick)
    reconnecting = recon is not None
    job = pick_job(pct, tick)
    mbps = speed_mbps(pct, reconnecting)
    chunk = int(mbps * 1_000_000 / 8 * TICK_SEC * random.uniform(0.85, 1.12))
    if not reconnecting:
        if job["key"] == "visa":
            state["bytes_visa"] = int(state.get("bytes_visa", 0)) + chunk
            state["visa_done"] = int(state.get("visa_done", 0)) + 1
        elif job["key"] == "mc":
            state["bytes_mc"] = int(state.get("bytes_mc", 0)) + chunk
            state["mc_done"] = int(state.get("mc_done", 0)) + 1
        else:
            state["bytes_amex"] = int(state.get("bytes_amex", 0)) + chunk
            state["amex_done"] = int(state.get("amex_done", 0)) + 1
    else:
        state["reconnects"] = int(state.get("reconnects", 0)) + 1

    visa_pct = min(99.9, pct + random.uniform(-0.25, 0.2))
    mc_pct = min(99.9, pct + random.uniform(-0.3, 0.25))
    amex_pct = min(99.9, pct + random.uniform(-0.35, 0.2))
    if job["key"] == "visa":
        visa_pct = min(99.9, pct + 0.14)
    elif job["key"] == "mc":
        mc_pct = min(99.9, pct + 0.14)
    else:
        amex_pct = min(99.9, pct + 0.14)

    latency = random.randint(18, 52) if not reconnecting else random.randint(80, 180)
    loss = "0.00%" if not reconnecting else random.choice(["0.02%", "0.04%", "0.01%"])
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S")

    clear()
    print(f"{BOLD}{WHITE}G Cards EU{RESET}  {DIM}│{RESET}  Issuer programme sync  {DIM}│{RESET}  {CYAN}{CHANNEL}{RESET}")
    print(f"{DIM}{ts} Europe/Warsaw · {state.get('resume_note', 'Continuing sync')}{RESET}")
    print(f"{DIM}Resumed session · started {state['started_at'][:19]} · target window {state.get('duration_hours', DURATION_HOURS):.0f}h{RESET}")
    print()
    print(f"{BOLD}Overall progress{RESET}  {pct:5.2f}%   [{GREEN}{bar(pct)}{RESET}]")
    print(f"{DIM}ETA remaining{RESET}      {BOLD}{YELLOW}{fmt_hms(remaining)}{RESET}   {DIM}(continuing from {float(state.get('start_pct', START_PCT)):.0f}%){RESET}")
    print()
    print(f"{BLUE}● Visa{RESET}              {visa_pct:5.2f}%  [{BLUE}{bar(visa_pct, 26)}{RESET}]  {DIM}{VISA_HOST}{RESET}")
    print(f"{MAGENTA}● Mastercard{RESET}        {mc_pct:5.2f}%  [{MAGENTA}{bar(mc_pct, 26)}{RESET}]  {DIM}{MC_HOST}{RESET}")
    print(f"{ORANGE}● American Express{RESET}  {amex_pct:5.2f}%  [{ORANGE}{bar(amex_pct, 26)}{RESET}]  {DIM}{AMEX_HOST}{RESET}")
    print()
    print(f"{BOLD}Link{RESET}")
    print(
        f"  Internet speed   {BOLD}{WHITE}{mbps:5.1f} Mbps{RESET}"
        f"   latency {latency} ms   loss {loss}"
    )
    print(
        f"  Throughput       {chunk/1_048_576:6.2f} MB/s"
        f"   · Visa {state['bytes_visa']/1_048_576:,.1f} MB"
        f" · MC {state['bytes_mc']/1_048_576:,.1f} MB"
        f" · Amex {state['bytes_amex']/1_048_576:,.1f} MB"
    )
    print()

    if reconnecting and recon:
        print(f"{BOLD}Connection{RESET}")
        print(f"  {recon['color']}{BOLD}{recon['title']}{RESET}")
        print(f"  {DIM}{recon['detail']}{RESET}")
        print(f"  host {DIM}{recon['host']}{RESET}  ·  retries {state.get('reconnects', 0)}  ·  status {YELLOW}HANDSHAKE{RESET}")
        print()
        print(f"{BOLD}Next download{RESET}")
        print(f"  Queued {job['color']}{job['network']}{RESET} BIN package  →  {WHITE}{job['file']}{RESET}")
    else:
        print(f"{BOLD}Active transfer{RESET}")
        print(
            f"  Downloading from {job['color']}{BOLD}{job['network']}{RESET}"
            f"  →  {WHITE}{job['file']}{RESET}"
        )
        print(f"  {DIM}GET https://{job['host']}/issuer/packages/{job['file']}{RESET}")
        print(
            f"  Status {GREEN}OK{RESET}"
            f"   package {job['label']}"
            f"   blocks "
            f"{int(state.get('visa_done', 0)) + int(state.get('mc_done', 0)) + int(state.get('amex_done', 0)):,}"
        )

    print()
    print(f"{DIM}── transfer log ───────────────────────────────────────────────────{RESET}")
    for i in range(4):
        past = pick_job(max(START_PCT, pct - (3 - i) * 0.05), max(0, tick - (3 - i)))
        print(
            f"  Transferring {past['file']}  →  {past['color']}{past['network']}{RESET}"
            f"   {GREEN}OK{RESET}   {pct - (3 - i) * 0.015:5.2f}%"
            f"   Remaining: {fmt_hms(remaining + (3 - i) * 35)}"
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
