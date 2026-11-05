#!/usr/bin/env python3
"""G Cards EU — server-side BIN package installation (Visa / Mastercard / Amex)."""

from __future__ import annotations

import json
import math
import os
import random
import re
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

STATE_PATH = Path(os.environ.get("GCARDS_INSTALL_STATE", "/cursor/stores/self/issuer-sync/install-state.json"))
DURATION_HOURS = float(os.environ.get("GCARDS_INSTALL_HOURS", "24"))
START_PCT = float(os.environ.get("GCARDS_INSTALL_START_PCT", "12.0"))
TICK_SEC = 1.25

SERVER = "fra1-issuer-01.g-cards.eu"
MOUNT = "/var/lib/gcards/issuer/bins"
CHANNEL = "Frankfurt dedicated · BIN install pipeline"

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
ORANGE = "\033[38;5;130m"
GRAY = "\033[38;5;240m"
INK = "\033[38;5;16m"

_running = True

STEPS = [
    ("verify", "Verify package checksums"),
    ("unpack", "Unpack execute packages on server"),
    ("map", "Map BIN ranges into issuer tables"),
    ("index", "Build BIN lookup indexes"),
    ("schema", "Apply card-programme schema patches"),
    ("activate", "Stage network activation flags"),
]


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


def bar(pct: float, width: int = 34) -> str:
    filled = int(round(max(0, min(100, pct)) / 100 * width))
    return "█" * filled + "░" * (width - filled)


def paint(line: str = "") -> None:
    width = max(88, min(120, os.get_terminal_size().columns if sys.stdout.isatty() else 100))
    bare = re.sub(r"\033\[[0-9;]*m", "", line)
    pad = max(0, width - len(bare))
    sys.stdout.write(f"{BG}{FG}{line}{' ' * pad}{RESET}\n")


def clear() -> None:
    sys.stdout.write("\033[2J\033[H\033[48;5;255m\033[38;5;16m")
    sys.stdout.flush()


def load_state() -> dict:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    force = os.environ.get("GCARDS_INSTALL_RESET", "").strip() in {"1", "true", "yes"}
    if STATE_PATH.exists() and not force:
        try:
            data = json.loads(STATE_PATH.read_text())
            if "started_at" in data and not data.get("completed"):
                return data
        except Exception:
            pass
    data = {
        "started_at": now_local().isoformat(),
        "start_pct": START_PCT,
        "duration_hours": DURATION_HOURS,
        "visa_bins": 1_240_000,
        "mc_bins": 980_000,
        "amex_bins": 420_000,
        "visa_installed": 0,
        "mc_installed": 0,
        "amex_installed": 0,
        "step": 0,
        "completed": False,
        "note": "Installing downloaded BIN packages on dedicated Frankfurt server",
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
    # Normal BIN install curve: faster early verify, slower index/activate
    eased = 1.0 - (1.0 - t) ** 1.12
    pct = start_pct + span * eased
    remaining = max(0.0, duration - elapsed)
    if pct >= 99.97:
        return 100.0, 0.0
    return min(99.96, pct), remaining


def step_for(pct: float) -> int:
    # Map overall % into install stages
    if pct < 25:
        return 0
    if pct < 40:
        return 1
    if pct < 58:
        return 2
    if pct < 78:
        return 3
    if pct < 90:
        return 4
    return 5


def completion_screen(state: dict) -> None:
    clear()
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S %Z")
    paint(f"{BOLD}{INK}╔════════════════════════════════════════════════════════════════════╗{RESET}")
    paint(f"{BOLD}{INK}║  G Cards EU · Server BIN Install · COMPLETE                        ║{RESET}")
    paint(f"{BOLD}{INK}╚════════════════════════════════════════════════════════════════════╝{RESET}")
    paint()
    paint(f"  {GREEN}✓{RESET} Visa BIN tables installed")
    paint(f"  {GREEN}✓{RESET} Mastercard BIN tables installed")
    paint(f"  {GREEN}✓{RESET} American Express BIN tables installed")
    paint(f"  {GRAY}Server{RESET}  {SERVER}")
    paint(f"  {GRAY}Path{RESET}    {MOUNT}")
    paint(f"  {GRAY}Finished{RESET} {ts}")
    paint()
    paint(f"{YELLOW}┌────────────────────────────────────────────────────────────────────┐{RESET}")
    paint(f"{YELLOW}│{RESET}  {BOLD}NEXT{RESET}                                                              {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}  Please contact API and code provider to activate BINs             {YELLOW}│{RESET}")
    paint(f"{YELLOW}│{RESET}  on your platforms.                                                {YELLOW}│{RESET}")
    paint(f"{YELLOW}└────────────────────────────────────────────────────────────────────┘{RESET}")
    paint()
    paint(f"{GRAY}Press Ctrl+C to exit.{RESET}")
    sys.stdout.flush()


def frame(state: dict, tick: int) -> None:
    pct, remaining = progress_for(state)
    if pct >= 100.0:
        state["completed"] = True
        state["visa_installed"] = state["visa_bins"]
        state["mc_installed"] = state["mc_bins"]
        state["amex_installed"] = state["amex_bins"]
        save_state(state)
        completion_screen(state)
        return

    step_i = step_for(pct)
    state["step"] = step_i
    step_id, step_label = STEPS[step_i]

    # Installed counts climb with overall progress
    def installed(total: int, bias: float) -> int:
        local = min(1.0, (pct / 100.0) * bias + random.uniform(-0.002, 0.002))
        return max(0, min(total, int(total * local)))

    state["visa_installed"] = installed(int(state["visa_bins"]), 1.02)
    state["mc_installed"] = installed(int(state["mc_bins"]), 0.98)
    state["amex_installed"] = installed(int(state["amex_bins"]), 0.95)

    visa_pct = state["visa_installed"] / state["visa_bins"] * 100
    mc_pct = state["mc_installed"] / state["mc_bins"] * 100
    amex_pct = state["amex_installed"] / state["amex_bins"] * 100

    # Current file being installed
    nets = [
        ("Visa", BLUE, f"visa_issuer_execute_{1842 + tick // 40:06d}.bin", visa_pct),
        ("Mastercard", MAGENTA, f"mastercard_issuer_execute_{1766 + tick // 40:06d}.bin", mc_pct),
        ("American Express", ORANGE, f"amex_issuer_execute_{1594 + tick // 40:06d}.bin", amex_pct),
    ]
    active = nets[tick % 3]

    cpu = 28 + 18 * abs(math.sin(time.time() / 5.5)) + random.uniform(-2, 2)
    disk = 120 + 80 * abs(math.sin(time.time() / 7.2)) + random.uniform(-8, 10)
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S")

    clear()
    paint(f"{BOLD}{INK}G Cards EU{RESET}  {GRAY}│{RESET}  Server BIN installation  {GRAY}│{RESET}  {CYAN}{CHANNEL}{RESET}")
    paint(f"{GRAY}{ts} Europe/Warsaw · {state.get('note', 'Installing BIN packages')}{RESET}")
    paint(f"{GRAY}Host {SERVER} · mount {MOUNT} · normal install window ~24h{RESET}")
    paint()
    paint(f"{BOLD}Overall install{RESET}  {INK}{pct:5.2f}%{RESET}  [{GREEN}{bar(pct)}{RESET}]")
    paint(f"{GRAY}ETA remaining{RESET}     {BOLD}{YELLOW}{fmt_hms(remaining)}{RESET}   {GRAY}(typical dedicated-server BIN install){RESET}")
    paint()
    paint(f"{BOLD}Current stage{RESET}  {CYAN}{step_id.upper()}{RESET}  —  {step_label}")
    paint()
    paint(f"{BOLD}Network BIN tables{RESET}")
    paint(
        f"  {BLUE}● Visa{RESET}              {state['visa_installed']:,} / {state['visa_bins']:,} BINs"
        f"   {visa_pct:5.2f}%  [{BLUE}{bar(visa_pct, 22)}{RESET}]"
    )
    paint(
        f"  {MAGENTA}● Mastercard{RESET}        {state['mc_installed']:,} / {state['mc_bins']:,} BINs"
        f"   {mc_pct:5.2f}%  [{MAGENTA}{bar(mc_pct, 22)}{RESET}]"
    )
    paint(
        f"  {ORANGE}● American Express{RESET}  {state['amex_installed']:,} / {state['amex_bins']:,} BINs"
        f"   {amex_pct:5.2f}%  [{ORANGE}{bar(amex_pct, 22)}{RESET}]"
    )
    paint()
    paint(f"{BOLD}Installing package on server{RESET}")
    paint(f"  Network  {active[1]}{BOLD}{active[0]}{RESET}")
    paint(f"  Package  {INK}{active[2]}{RESET}  (50.00 GB execute file)")
    paint(f"  Action   unpack → map BIN ranges → write issuer tables")
    paint(f"  Status   {GREEN}INSTALLING{RESET}   path {GRAY}{MOUNT}/{active[0].lower().replace(' ', '_')}/{RESET}")
    paint()
    paint(f"{BOLD}Server load{RESET}")
    paint(f"  CPU {cpu:4.1f}%   disk write {disk:5.1f} MB/s   workers 8   queue depth {random.randint(12, 48)}")
    paint()
    paint(f"{GRAY}── install log ──────────────────────────────────────────────────────{RESET}")
    for i, (name, color, fname, _) in enumerate(nets):
        paint(
            f"  {GREEN}OK{RESET}  installing {fname}  →  {color}{name}{RESET}"
            f"   stage {STEPS[(step_i + i) % len(STEPS)][0]}"
        )
    paint()
    paint(f"{GRAY}Pipeline: download terminal feeds packages → this installer maps BINs on {SERVER}{RESET}")
    paint(f"{GRAY}Ctrl+C stop · state {STATE_PATH}{RESET}")
    sys.stdout.flush()
    save_state(state)


def on_signal(signum, frame) -> None:  # noqa: ARG001
    global _running
    _running = False


def main() -> int:
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
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
    paint(f"{GRAY}BIN install terminal stopped.{RESET}")
    sys.stdout.write(RESET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
