(() => {
  /**
   * Merge nearly complete — 98.6%.
   * Now: merging BINs + old/legacy files
   * Next: install remaining files through Sunday 08.11.2026 23:50 Warsaw
   * Some packages already installing
   */
  const TZ = "Europe/Warsaw";
  const START = new Date("2026-11-02T05:38:00+01:00");
  const INSTALL_END = new Date("2026-11-08T23:50:00+01:00"); // Sunday 23:50
  const START_PCT = 98.6;
  const FILE_GB = 50;
  const OPENED_AT = Date.now();

  const stages = [
    ["connect", "Dedicated server linked"],
    ["merge", "Merging BINs and legacy files"],
    ["verify", "Verifying merged BIN tables"],
    ["install", "Installing selected packages now"],
    ["finish", "Continue file install until Sunday 23:50"],
    ["online", "Issuing online after install window"],
  ];

  const networks = [
    {
      key: "visa",
      name: "Visa",
      className: "visa",
      file: "visa_issuer_execute_001842.bin",
      totalBins: 1_240_000,
      bias: 1.004,
      badge: "MERGING BINS",
      note: "Merging BINs & legacy ranges",
    },
    {
      key: "mc",
      name: "Mastercard",
      className: "mc",
      file: "mastercard_issuer_execute_001766.bin",
      totalBins: 980_000,
      bias: 0.998,
      badge: "MERGING · INSTALL",
      note: "Old files merging · install running",
    },
    {
      key: "amex",
      name: "American Express",
      className: "amex",
      file: "amex_issuer_execute_001594.bin",
      totalBins: 420_000,
      bias: 0.972,
      badge: "INSTALLING",
      note: "File install in progress · till Sun 23:50",
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
        <div class="meter"><i style="width:98.6%"></i></div>
        <div class="stats">
          <span>Progress <b class="file-pct">98.6%</b></span>
          <span>BINs <b class="bins">0</b></span>
        </div>
        <span class="badge">${n.badge}</span>
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
    const remainingSec = Math.max(0, (INSTALL_END.getTime() - now) / 1000);
    // Merge holds near 98.6%; residual creeps as install window progresses
    const windowSec = Math.max(1, (INSTALL_END.getTime() - OPENED_AT) / 1000);
    const done = 1 - remainingSec / windowSec;
    const pct = START_PCT + (99.4 - START_PCT) * Math.pow(Math.max(0, done), 1.2);
    return { pct: Math.min(99.4, Math.max(START_PCT, pct)), remainingSec };
  }

  function stageIndex(pct) {
    if (pct < 40) return 0;
    if (pct < 98.75) return 1; // merging BINs
    if (pct < 98.9) return 2;
    if (pct < 99.1) return 3;
    if (pct < 99.35) return 4;
    return 5;
  }

  function updatePipes() {
    document.querySelectorAll(".pipe").forEach((el) => el.classList.remove("on", "done"));
    const connect = document.querySelector('[data-pipe="connect"]');
    const install = document.querySelector('[data-pipe="install"]');
    connect.classList.add("done");
    install.classList.add("on");
    pipeConnect.textContent = "Nearly complete · 98.6%";
    pipeInstall.textContent = "Installing · till Sun 23:50";
    pipeOnline.textContent = "After Sunday 23:50";
  }

  function pushLog(text, net) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">OK</span><span>${text}</span><span class="net">${net}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 22) logEl.lastChild.remove();
  }

  const logLines = [
    ["Merge nearly completed successfully on fra1-issuer-01", "merge"],
    ["Merging Visa BIN ranges and legacy files", "Visa"],
    ["Merging Mastercard BIN tables from old host", "Mastercard"],
    ["Installing American Express package on server", "Amex"],
    ["Verifying merged BIN checksums", "verify"],
    ["Next: continue file install through Sunday 23:50", "install"],
    ["Issuing remains closed until install window ends", "online"],
  ];

  if (startedEl) startedEl.textContent = "02.11.2026 05:38 Warsaw";
  if (estEndEl) estEndEl.textContent = "Sunday 08.11.2026 23:50 Warsaw";

  let tick = 0;
  function render() {
    const { pct, remainingSec } = progress();
    const displayPct = Math.max(START_PCT, pct);
    const si = stageIndex(displayPct);
    const [sid, slabel] = stages[si];
    const remLabel = fmtParts(remainingSec);

    overallPct.textContent = `${displayPct.toFixed(1)}%`;
    overallBar.style.width = `${displayPct}%`;
    overallEta.textContent = `${remLabel} · till Sun 23:50`;
    goLiveNote.innerHTML =
      'Merge <strong>nearly completed successfully</strong>. Now merging <strong>BINs &amp; old files</strong>. Next: <strong>install files</strong> through <strong>Sunday 23:50</strong> Warsaw.';
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;
    footNote.textContent = `File install through Sunday 08.11.2026 23:50 Warsaw · ${remLabel} remaining`;
    updatePipes();

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });

    clockEl.textContent = new Date().toLocaleString("en-GB", { timeZone: TZ, hour12: false });

    const cpu = 52 + 14 * Math.abs(Math.sin(Date.now() / 5000));
    const disk = 240 + 70 * Math.abs(Math.sin(Date.now() / 6400));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · merge + install workers 10`;

    networks.forEach((n, idx) => {
      const lag = idx === 2 ? 0.965 : idx === 1 ? 0.992 : 1;
      const filePct = Math.min(99.7, Math.max(START_PCT * 0.96, displayPct * n.bias * lag));
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
      banner.innerHTML = `<p><strong>Status:</strong> Merge <strong>${displayPct.toFixed(1)}%</strong> — nearly completed successfully. Currently <strong>merging BINs and old files</strong>. File install is already running and continues until <strong>Sunday 08.11.2026 23:50</strong> Warsaw · remaining <strong>${remLabel}</strong>.</p>`;
    }

    if (remainingSec <= 0) {
      overallPct.textContent = "100%";
      overallBar.style.width = "100%";
      overallEta.textContent = "0D 00H 00m 00s";
      stageLabel.textContent = "ONLINE — G Cards EU available for issuing cards";
      banner.classList.add("ready");
      banner.dataset.locked = "1";
      banner.innerHTML =
        "<p><strong>G Cards EU is online.</strong> Merge and install complete. You can start issuing cards.</p>";
      return;
    }

    tick += 1;
    requestAnimationFrame(() => setTimeout(render, 1000));
  }

  render();
})();
