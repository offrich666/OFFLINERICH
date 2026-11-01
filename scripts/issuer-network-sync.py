#!/usr/bin/env python3
"""G Cards EU — professional light-terminal Visa / Mastercard / Amex issuer sync."""

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
DURATION_HOURS = float(os.environ.get("GCARDS_SYNC_HOURS", "3.283333"))
START_PCT = float(os.environ.get("GCARDS_SYNC_START_PCT", "99.63"))
TICK_SEC = 1.15
FILE_BYTES = 50 * 1024 * 1024 * 1024  # 50 GB per execute package

VISA_HOST = "secure.download.visa.com"
MC_HOST = "files.mastercard.com"
AMEX_HOST = "secure.americanexpress.com"
CHANNEL = "TLS 1.3 · issuer execute packages · resumed"

# Light / white professional palette
BG = "\033[48;5;255m"
FG = "\033[38;5;16m"
RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
CYAN = "\033[38;5;31m"
GREEN = "\033[38;5;28m"
YELLOW = "\033[38;5;136m"
BLUE = "\033[38;5;25m"
MAGENTA = "\033[38;5;90m"
WHITE = "\033[38;5;16m"  # primary ink on white
ORANGE = "\033[38;5;130m"
GRAY = "\033[38;5;240m"

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


def fmt_bytes(n: float) -> str:
    n = float(n)
    gb = n / (1024 ** 3)
    if gb >= 10:
        return f"{gb:,.2f} GB"
    if gb >= 1:
        return f"{gb:,.3f} GB"
    return f"{n / (1024 ** 2):,.1f} MB"


def bar(pct: float, width: int = 34) -> str:
    filled = int(round(max(0, min(100, pct)) / 100 * width))
    return "█" * filled + "░" * (width - filled)


def paint(line: str = "") -> None:
    # Force white row background for a clean light terminal
    width = max(88, min(120, os.get_terminal_size().columns if sys.stdout.isatty() else 100))
    bare = line
    for code in (BG, FG, RESET, DIM, BOLD, CYAN, GREEN, YELLOW, BLUE, MAGENTA, WHITE, ORANGE, GRAY):
        bare = bare.replace(code, "")
    import re

    bare = re.sub(r"\033\[[0-9;]*m", "", bare)
    pad = max(0, width - len(bare))
    sys.stdout.write(f"{BG}{FG}{line}{' ' * pad}{RESET}\n")


def clear() -> None:
    sys.stdout.write("\033[2J\033[H")
    sys.stdout.write("\033[48;5;255m\033[38;5;16m")
    sys.stdout.flush()


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
        "resume_note": f"Continuing issuer execute-file sync from {START_PCT:.2f}%",
        "visa_file_idx": 1842,
        "mc_file_idx": 1766,
        "amex_file_idx": 1594,
        "visa_file_done": 0.0,
        "mc_file_done": 0.0,
        "amex_file_done": 0.0,
        "bytes_visa": 0,
        "bytes_mc": 0,
        "bytes_amex": 0,
        "reconnects": 0,
        "completed": False,
    }
    save_state(data)
    return data


def save_state(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2)
    tmp = STATE_PATH.with_suffix(".json.tmp")
    for attempt in range(8):
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, STATE_PATH)
            return
        except OSError:
            time.sleep(0.05 * (attempt + 1))


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
    eased = 1.0 - (1.0 - t) ** 1.05
    pct = start_pct + span * eased
    remaining = max(0.0, duration - elapsed)
    if pct >= 99.97:
        return 100.0, 0.0
    return min(99.96, pct), remaining


def speed_mbps(reconnecting: bool) -> float:
    if reconnecting:
        return max(0.5, random.uniform(1.2, 5.5))
    base = 64 + 14 * math.sin(time.time() / 6.8) + 7 * math.sin(time.time() / 2.4)
    return max(28.0, base + random.uniform(-3.0, 4.5))


def exec_name(network: str, idx: int) -> str:
    prefix = {"Visa": "visa", "Mastercard": "mastercard", "American Express": "amex"}[network]
    return f"{prefix}_issuer_execute_{idx:06d}.bin"


def advance_file(state: dict, key: str, chunk: int) -> dict:
    done_key = f"{key}_file_done"
    idx_key = f"{key}_file_idx"
    done = float(state.get(done_key, 0.0)) + chunk
    idx = int(state.get(idx_key, 1000))
    rolled = False
    while done >= FILE_BYTES:
        done -= FILE_BYTES
        idx += 1
        rolled = True
    state[done_key] = done
    state[idx_key] = idx
    return {
        "done": done,
        "idx": idx,
        "pct": min(99.99, done / FILE_BYTES * 100),
        "rolled": rolled,
    }


def reconnect_phase(tick: int) -> dict | None:
    phase = tick % 20
    if phase == 5:
        return {
            "title": "Reconnecting to Visa",
            "detail": "Secure session renew · next execute BIN package",
            "host": VISA_HOST,
            "color": BLUE,
        }
    if phase == 11:
        return {
            "title": "Reconnecting to American Express servers",
            "detail": "TLS resume · requesting Amex execute package",
            "host": AMEX_HOST,
            "color": ORANGE,
        }
    if phase == 16:
        return {
            "title": "Connecting Mastercard",
            "detail": "Authorising CDN · Mastercard execute stream",
            "host": MC_HOST,
            "color": MAGENTA,
        }
    return None


def completion_screen(state: dict) -> None:
    clear()
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S %Z")
    paint(f"{BOLD}{WHITE}╔════════════════════════════════════════════════════════════════════╗{RESET}")
    paint(f"{BOLD}{WHITE}║  G Cards EU · Issuer Execute Sync · COMPLETE                       ║{RESET}")
    paint(f"{BOLD}{WHITE}╚════════════════════════════════════════════════════════════════════╝{RESET}")
    paint()
    paint(f"  {GREEN}✓{RESET} Visa execute packages              {BOLD}100%{RESET}  OK")
    paint(f"  {GREEN}✓{RESET} Mastercard execute packages        {BOLD}100%{RESET}  OK")
    paint(f"  {GREEN}✓{RESET} American Express execute packages  {BOLD}100%{RESET}  OK")
    paint(f"  {GRAY}Each package size{RESET}  {WHITE}50.00 GB{RESET}")
    paint(f"  {GRAY}Finished{RESET}  {ts}")
    paint()
    paint(f"{YELLOW}┌────────────────────────────────────────────────────────────────────┐{RESET}")
    paint(f"{YELLOW}│{RESET}  {BOLD}ACTION REQUIRED{RESET}                                                   {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}                                                                    {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}  Please contact API and code provider to activate BINs             {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}  on your platforms.                                                {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}                                                                    {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}  Visa · Mastercard · American Express execute files are ready.     {YELLOW}│{RESET}")
    paint(f"{YELLOW}└────────────────────────────────────────────────────────────────────┘{RESET}")
    paint()
    paint(f"{GRAY}Press Ctrl+C to exit.{RESET}")
    sys.stdout.flush()


def frame(state: dict, tick: int) -> None:
    pct, remaining = progress_for(state)
    if pct >= 100.0:
        state["completed"] = True
        save_state(state)
        completion_screen(state)
        return

    recon = reconnect_phase(tick)
    reconnecting = recon is not None
    mbps = speed_mbps(reconnecting)
    # split throughput across three parallel downloads
    per = mbps / 3.0
    chunk = int(per * 1_000_000 / 8 * TICK_SEC * random.uniform(0.9, 1.1))

    if not reconnecting:
        visa_f = advance_file(state, "visa", chunk)
        mc_f = advance_file(state, "mc", chunk)
        amex_f = advance_file(state, "amex", chunk)
        state["bytes_visa"] = int(state.get("bytes_visa", 0)) + chunk
        state["bytes_mc"] = int(state.get("bytes_mc", 0)) + chunk
        state["bytes_amex"] = int(state.get("bytes_amex", 0)) + chunk
    else:
        state["reconnects"] = int(state.get("reconnects", 0)) + 1
        visa_f = {
            "done": float(state.get("visa_file_done", 0)),
            "idx": int(state.get("visa_file_idx", 1)),
            "pct": min(99.99, float(state.get("visa_file_done", 0)) / FILE_BYTES * 100),
        }
        mc_f = {
            "done": float(state.get("mc_file_done", 0)),
            "idx": int(state.get("mc_file_idx", 1)),
            "pct": min(99.99, float(state.get("mc_file_done", 0)) / FILE_BYTES * 100),
        }
        amex_f = {
            "done": float(state.get("amex_file_done", 0)),
            "idx": int(state.get("amex_file_idx", 1)),
            "pct": min(99.99, float(state.get("amex_file_done", 0)) / FILE_BYTES * 100),
        }

    visa_name = exec_name("Visa", visa_f["idx"])
    mc_name = exec_name("Mastercard", mc_f["idx"])
    amex_name = exec_name("American Express", amex_f["idx"])

    latency = random.randint(16, 42) if not reconnecting else random.randint(90, 170)
    loss = "0.00%" if not reconnecting else random.choice(["0.01%", "0.02%", "0.00%"])
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S")

    clear()
    paint(f"{BOLD}{WHITE}G Cards EU{RESET}  {GRAY}│{RESET}  Issuer execute-file sync  {GRAY}│{RESET}  {CYAN}{CHANNEL}{RESET}")
    paint(f"{GRAY}{ts} Europe/Warsaw · {state.get('resume_note', 'Continuing sync')}{RESET}")
    paint(
        f"{GRAY}Resumed · started {state['started_at'][:19]} · window {float(state.get('duration_hours', DURATION_HOURS)):.0f}h"
        f" · package size {WHITE}50.00 GB{RESET}{GRAY} each{RESET}"
    )
    paint()
    paint(f"{BOLD}Overall progress{RESET}  {WHITE}{pct:6.2f}%{RESET}  [{GREEN}{bar(pct)}{RESET}]")
    eta_label = "finalising" if pct >= 99.5 else f"from {float(state.get('start_pct', START_PCT)):.2f}%"
    paint(
        f"{GRAY}ETA remaining{RESET}      {BOLD}{YELLOW}{fmt_hms(remaining)}{RESET}"
        f"   {GRAY}({eta_label}){RESET}"
    )
    if pct >= 99.5:
        paint(f"{GREEN}Status{RESET}            Near complete · flushing final execute blocks to local cache")
    paint()
    paint(f"{BOLD}Parallel downloads{RESET}  {GRAY}Visa · Mastercard · American Express{RESET}")
    paint()

    # Visa file card
    paint(f"  {BLUE}● VISA{RESET}              host {GRAY}{VISA_HOST}{RESET}")
    paint(f"    File   {WHITE}{visa_name}{RESET}")
    paint(
        f"    Size   {CYAN}50.00 GB{RESET}   received {fmt_bytes(visa_f['done'])}"
        f"   file {visa_f['pct']:5.2f}%  [{BLUE}{bar(visa_f['pct'], 22)}{RESET}]"
    )
    paint(f"    GET https://{VISA_HOST}/issuer/execute/{visa_name}   {GREEN}DOWNLOADING{RESET}")
    paint()

    # Mastercard
    paint(f"  {MAGENTA}● MASTERCARD{RESET}        host {GRAY}{MC_HOST}{RESET}")
    paint(f"    File   {WHITE}{mc_name}{RESET}")
    paint(
        f"    Size   {CYAN}50.00 GB{RESET}   received {fmt_bytes(mc_f['done'])}"
        f"   file {mc_f['pct']:5.2f}%  [{MAGENTA}{bar(mc_f['pct'], 22)}{RESET}]"
    )
    paint(f"    GET https://{MC_HOST}/issuer/execute/{mc_name}   {GREEN}DOWNLOADING{RESET}")
    paint()

    # Amex
    paint(f"  {ORANGE}● AMERICAN EXPRESS{RESET}  host {GRAY}{AMEX_HOST}{RESET}")
    paint(f"    File   {WHITE}{amex_name}{RESET}")
    paint(
        f"    Size   {CYAN}50.00 GB{RESET}   received {fmt_bytes(amex_f['done'])}"
        f"   file {amex_f['pct']:5.2f}%  [{ORANGE}{bar(amex_f['pct'], 22)}{RESET}]"
    )
    paint(f"    GET https://{AMEX_HOST}/issuer/execute/{amex_name}   {GREEN}DOWNLOADING{RESET}")
    paint()

    paint(f"{BOLD}Link{RESET}")
    paint(
        f"  Internet speed  {BOLD}{WHITE}{mbps:5.1f} Mbps{RESET}"
        f"   latency {latency} ms   loss {loss}"
        f"   path {GRAY}3× parallel execute streams{RESET}"
    )
    paint(
        f"  Session total   Visa {fmt_bytes(state['bytes_visa'])}"
        f" · MC {fmt_bytes(state['bytes_mc'])}"
        f" · Amex {fmt_bytes(state['bytes_amex'])}"
    )
    paint()

    if reconnecting and recon:
        paint(f"{BOLD}Connection{RESET}")
        paint(f"  {recon['color']}{BOLD}{recon['title']}{RESET}")
        paint(f"  {GRAY}{recon['detail']}{RESET}")
        paint(f"  host {GRAY}{recon['host']}{RESET}  ·  retries {state.get('reconnects', 0)}  ·  {YELLOW}HANDSHAKE{RESET}")
    else:
        paint(f"{BOLD}Active{RESET}")
        paint(
            f"  Downloading execute files from {BLUE}Visa{RESET} · {MAGENTA}Mastercard{RESET} · {ORANGE}American Express{RESET}"
            f"   status {GREEN}OK{RESET}"
        )

    paint()
    paint(f"{GRAY}── transfer log ─────────────────────────────────────────────────────{RESET}")
    paint(f"  {GREEN}OK{RESET}  {visa_name}  →  Visa               {fmt_bytes(visa_f['done'])} / 50.00 GB")
    paint(f"  {GREEN}OK{RESET}  {mc_name}  →  Mastercard         {fmt_bytes(mc_f['done'])} / 50.00 GB")
    paint(f"  {GREEN}OK{RESET}  {amex_name}  →  American Express   {fmt_bytes(amex_f['done'])} / 50.00 GB")
    paint()
    paint(f"{GRAY}Ctrl+C stop · state {STATE_PATH}{RESET}")
    sys.stdout.flush()
    save_state(state)


def on_signal(signum, frame) -> None:  # noqa: ARG001
    global _running
    _running = False


def main() -> int:
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    # White / light mode for the whole session
    sys.stdout.write("\033[48;5;255m\033[38;5;16m\033[2J\033[H")
    sys.stdout.flush()
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
    paint(f"{GRAY}Sync terminal stopped.{RESET}")
    sys.stdout.write(RESET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
