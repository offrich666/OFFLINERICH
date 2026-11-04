(() => {
  /**
   * Migration / install — 95.6%.
   * Now: migrating + installing selected files
   * Next: finish remaining install
   * Issuing / use EST: 06.11.2026 ≈ 15:00 ±30m Warsaw
   */
  const TZ = "Europe/Warsaw";
  const START = new Date("2026-11-02T05:38:00+01:00");
  const END = new Date("2026-11-06T15:00:00+01:00");
  const END_EARLY = new Date("2026-11-06T14:30:00+01:00");
  const END_LATE = new Date("2026-11-06T15:30:00+01:00");
  const START_PCT = 95.6;
  const FILE_GB = 50;
  const OPENED_AT = Date.now();

  const stages = [
    ["connect", "Dedicated server link established"],
    ["migrate", "Migrating programme hosts into Frankfurt"],
    ["verify", "Verifying package integrity during migration"],
    ["install", "Installing selected Visa / MC / Amex files"],
    ["finish", "Next: install remaining packages"],
    ["online", "Prepare issuing go-live · use platform"],
  ];

  const networks = [
    {
      key: "visa",
      name: "Visa",
      className: "visa",
      file: "visa_issuer_execute_001842.bin",
      totalBins: 1_240_000,
      bias: 1.01,
      note: "Migrating · installing",
    },
    {
      key: "mc",
      name: "Mastercard",
      className: "mc",
      file: "mastercard_issuer_execute_001766.bin",
      totalBins: 980_000,
      bias: 0.995,
      note: "Migrating · installing",
    },
    {
      key: "amex",
      name: "American Express",
      className: "amex",
      file: "amex_issuer_execute_001594.bin",
      totalBins: 420_000,
      bias: 0.985,
      note: "Queued for remaining install",
    },
  ];

  const overallPct = document.getElementById("overall-pct");
  const overallBar = document.getElementById("overall-bar");
  const overallEta = document.getElementById("overall-eta");
  const goLiveNote = document.getElementById("go-live-note");
  const stageLabel = document.getElementById("stage-label");
  const stagesEl = document.getElementById("stages");
  const filesEl = document.getElementById("files");
  const logEl = document.getElementById("log");
  const clockEl = document.getElementById("clock");
  const loadEl = document.getElementById("server-load");
  const banner = document.getElementById("status-banner");
  const footNote = document.getElementById("foot-note");
  const pipeConnect = document.getElementById("pipe-connect");
  const pipeInstall = document.getElementById("pipe-install");
  const pipeOnline = document.getElementById("pipe-online");
  const estEndEl = document.getElementById("est-end");
  const startedEl = document.getElementById("started-at");

  stagesEl.innerHTML = stages.map(([id]) => `<li data-stage="${id}">${id}</li>`).join("");

  filesEl.innerHTML = networks
    .map(
      (n) => `<article class="file ${n.className}" data-net="${n.key}">
        <p class="file-net">${n.name}</p>
        <h2>${n.file}</h2>
        <p class="size">${FILE_GB}.00 GB · ${n.note}</p>
        <div class="meter"><i style="width:95.6%"></i></div>
        <div class="stats">
          <span>Progress <b class="file-pct">95.6%</b></span>
          <span>BINs <b class="bins">0</b></span>
        </div>
        <span class="badge">${n.key === "amex" ? "NEXT · INSTALL" : "MIGRATING · INSTALL"}</span>
      </article>`,
    )
    .join("");

  function fmtParts(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}D ${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }

  function progress() {
    const now = Date.now();
    const remainingSec = Math.max(0, (END.getTime() - now) / 1000);
    const windowSec = Math.max(1, (END.getTime() - OPENED_AT) / 1000);
    const done = 1 - remainingSec / windowSec;
    // Hold near 95.6%; ease residual into ≈15:00 go-live
    const pct = START_PCT + (100 - START_PCT) * Math.pow(Math.max(0, done), 1.35);
    return { pct: Math.min(99.94, Math.max(START_PCT, pct)), remainingSec };
  }

  function stageIndex(pct) {
    if (pct < 40) return 0;
    if (pct < 70) return 1;
    if (pct < 85) return 2;
    if (pct < 96.2) return 3; // installing selected files
    if (pct < 98.5) return 4; // next: remaining install
    return 5;
  }

  function updatePipes(si) {
    document.querySelectorAll(".pipe").forEach((el) => el.classList.remove("on", "done"));
    const connect = document.querySelector('[data-pipe="connect"]');
    const install = document.querySelector('[data-pipe="install"]');
    const online = document.querySelector('[data-pipe="online"]');

    connect.classList.add("done");
    pipeConnect.textContent = "Migrating now";

    if (si < 5) {
      install.classList.add("on");
      pipeInstall.textContent =
        si <= 3 ? "Installing selected files" : "Next: finish remaining install";
      pipeOnline.textContent = "Issuing EST · 06.11 ≈15:00 ±";
    } else {
      install.classList.add("done");
      online.classList.add("on");
      pipeInstall.textContent = "Install complete";
      pipeOnline.textContent = "Opening for issuing · use";
    }
  }

  function pushLog(text, net) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">OK</span><span>${text}</span><span class="net">${net}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 22) logEl.lastChild.remove();
  }

  const logLines = [
    ["Migrating programme host into fra1-issuer-01", "migrate"],
    ["Installing selected Visa execute package on server", "Visa"],
    ["Installing selected Mastercard execute package on server", "Mastercard"],
    ["Queueing remaining Amex package for next install step", "Amex"],
    ["Verifying migrated BIN tables during install", "verify"],
    ["Next step: finish remaining file install", "install"],
    ["Issuing go-live window set for 06.11.2026 ≈ 15:00 ± Warsaw", "online"],
  ];

  if (startedEl) startedEl.textContent = "02.11.2026 05:38 Warsaw";
  if (estEndEl) estEndEl.textContent = "06.11.2026 ≈ 15:00 ±30m Warsaw";

  let tick = 0;
  function render() {
    const { pct, remainingSec } = progress();
    const displayPct = Math.max(START_PCT, pct);
    const si = stageIndex(displayPct);
    const [sid, slabel] = stages[si];
    const remLabel = fmtParts(remainingSec);

    overallPct.textContent = `${displayPct.toFixed(1)}%`;
    overallBar.style.width = `${displayPct}%`;
    overallEta.textContent = remLabel;
    goLiveNote.innerHTML =
      'Now <strong>migrating</strong> and installing selected files. Next: <strong>finish install</strong>. Start issuing cards &amp; use around <strong>06.11.2026 15:00</strong> Warsaw (±30m).';
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;
    footNote.textContent = `Issuing EST 06.11.2026 ≈ 15:00 ±30m Warsaw · ${remLabel} remaining`;
    updatePipes(si);

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });

    clockEl.textContent = new Date().toLocaleString("en-GB", { timeZone: TZ, hour12: false });

    const cpu = 48 + 16 * Math.abs(Math.sin(Date.now() / 5200));
    const disk = 210 + 85 * Math.abs(Math.sin(Date.now() / 6800));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · migrate workers 8`;

    networks.forEach((n, idx) => {
      // Amex slightly behind — remaining install next
      const lag = idx === 2 ? 0.92 : 1;
      const filePct = Math.min(99.6, Math.max(START_PCT * 0.97, displayPct * n.bias * lag));
      const bins = Math.floor(n.totalBins * (filePct / 100));
      const card = filesEl.querySelector(`[data-net="${n.key}"]`);
      if (!card) return;
      card.querySelector(".meter i").style.width = `${filePct}%`;
      card.querySelector(".file-pct").textContent = `${filePct.toFixed(1)}%`;
      card.querySelector(".bins").textContent = `${bins.toLocaleString()} / ${n.totalBins.toLocaleString()}`;
    });

    if (tick % 2 === 0) {
      const line = logLines[tick % logLines.length];
      pushLog(line[0], line[1]);
    }

    if (banner && !banner.dataset.locked) {
      banner.innerHTML = `<p><strong>Status:</strong> Migration <strong>${displayPct.toFixed(1)}%</strong> complete. Currently <strong>migrating</strong> and <strong>installing</strong> selected packages. Next step: <strong>finish file install</strong>. Estimated time to start issuing cards and use the platform: <strong>06.11.2026 around 15:00 ±</strong> Warsaw · remaining <strong>${remLabel}</strong>.</p>`;
    }

    if (remainingSec <= 0 || displayPct >= 99.97 || Date.now() >= END_LATE.getTime()) {
      overallPct.textContent = "100%";
      overallBar.style.width = "100%";
      overallEta.textContent = "0D 00H 00m 00s";
      stageLabel.textContent = "ONLINE — G Cards EU available for issuing cards";
      banner.classList.add("ready");
      banner.dataset.locked = "1";
      banner.innerHTML =
        "<p><strong>G Cards EU is online.</strong> Migration and install complete. You can start issuing cards and use the platform.</p>";
      return;
    }

    tick += 1;
    requestAnimationFrame(() => setTimeout(render, 1000));
  }

  render();
})();
