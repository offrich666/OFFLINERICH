(() => {
  /**
   * Merge completed successfully.
   * Now installing files — 12%.
   * Install window through Sunday 08.11.2026 23:50 Warsaw.
   */
  const TZ = "Europe/Warsaw";
  const INSTALL_END = new Date("2026-11-08T23:50:00+01:00");
  const START_PCT = 12.0;
  const FILE_GB = 50;
  const OPENED_AT = Date.now();

  const stages = [
    ["merge", "Merge completed successfully"],
    ["verify", "Post-merge integrity checks passed"],
    ["install", "Installing Visa / Mastercard / Amex files"],
    ["map", "Writing packages into issuer tables"],
    ["finish", "Continue install until Sunday 23:50"],
    ["online", "Issuing online after install window"],
  ];

  const networks = [
    {
      key: "visa",
      name: "Visa",
      className: "visa",
      file: "visa_issuer_execute_001842.bin",
      totalBins: 1_240_000,
      bias: 1.08,
      badge: "INSTALLING",
      note: "Installing on server after merge",
    },
    {
      key: "mc",
      name: "Mastercard",
      className: "mc",
      file: "mastercard_issuer_execute_001766.bin",
      totalBins: 980_000,
      bias: 0.96,
      badge: "INSTALLING",
      note: "Installing on server after merge",
    },
    {
      key: "amex",
      name: "American Express",
      className: "amex",
      file: "amex_issuer_execute_001594.bin",
      totalBins: 420_000,
      bias: 0.88,
      badge: "INSTALLING",
      note: "Installing on server after merge",
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

  stagesEl.innerHTML = stages.map(([id]) => `<li data-stage="${id}">${id}</li>`).join("");

  filesEl.innerHTML = networks
    .map(
      (n) => `<article class="file ${n.className}" data-net="${n.key}">
        <p class="file-net">${n.name}</p>
        <h2>${n.file}</h2>
        <p class="size">${FILE_GB}.00 GB · ${n.note}</p>
        <div class="meter"><i style="width:12%"></i></div>
        <div class="stats">
          <span>Install <b class="file-pct">12.0%</b></span>
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
    const windowSec = Math.max(1, (INSTALL_END.getTime() - OPENED_AT) / 1000);
    const done = 1 - remainingSec / windowSec;
    // Hold near 12%; ease toward 100% by Sunday 23:50
    const pct = START_PCT + (100 - START_PCT) * Math.pow(Math.max(0, done), 1.15);
    return { pct: Math.min(99.85, Math.max(START_PCT, pct)), remainingSec };
  }

  function stageIndex(pct) {
    if (pct < 8) return 0;
    if (pct < 12.5) return 2;
    if (pct < 45) return 2;
    if (pct < 70) return 3;
    if (pct < 92) return 4;
    return 5;
  }

  function updatePipes(displayPct) {
    document.querySelectorAll(".pipe").forEach((el) => el.classList.remove("on", "done"));
    const connect = document.querySelector('[data-pipe="connect"]');
    const install = document.querySelector('[data-pipe="install"]');
    const online = document.querySelector('[data-pipe="online"]');
    connect.classList.add("done");
    pipeConnect.textContent = "Completed successfully";
    if (displayPct < 99.5) {
      install.classList.add("on");
      pipeInstall.textContent = `Installing · ${displayPct.toFixed(1)}%`;
      pipeOnline.textContent = "After Sunday 23:50";
    } else {
      install.classList.add("done");
      online.classList.add("on");
      pipeInstall.textContent = "Install complete";
      pipeOnline.textContent = "Opening for issuing";
    }
  }

  function pushLog(text, net) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">OK</span><span>${text}</span><span class="net">${net}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 22) logEl.lastChild.remove();
  }

  const logLines = [
    ["Merge completed successfully on fra1-issuer-01", "merge"],
    ["Starting file install phase on dedicated server", "install"],
    ["Installing Visa execute package (12% phase)", "Visa"],
    ["Installing Mastercard execute package", "Mastercard"],
    ["Installing American Express execute package", "Amex"],
    ["Writing installed packages into issuer storage", "map"],
    ["Install window open through Sunday 23:50 Warsaw", "online"],
  ];

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
      'Merge <strong>completed successfully</strong>. Now <strong>installing files</strong> at <strong>' +
      displayPct.toFixed(1) +
      '%</strong>. Window open until <strong>Sunday 23:50</strong> Warsaw.';
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;
    footNote.textContent = `File install ${displayPct.toFixed(1)}% · through Sunday 08.11.2026 23:50 · ${remLabel}`;
    updatePipes(displayPct);

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });
    // mark merge + verify done always
    stagesEl.querySelectorAll("li").forEach((li, i) => {
      if (i <= 1) li.classList.add("done");
    });

    clockEl.textContent = new Date().toLocaleString("en-GB", { timeZone: TZ, hour12: false });

    const cpu = 44 + 18 * Math.abs(Math.sin(Date.now() / 4800));
    const disk = 190 + 95 * Math.abs(Math.sin(Date.now() / 6100));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · install workers 12`;

    networks.forEach((n) => {
      const filePct = Math.min(99.5, Math.max(8, displayPct * n.bias));
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
      banner.innerHTML = `<p><strong>Status:</strong> Merge <strong>completed successfully</strong>. File install running at <strong>${displayPct.toFixed(1)}%</strong>. Continues until <strong>Sunday 08.11.2026 23:50</strong> Warsaw · remaining <strong>${remLabel}</strong>.</p>`;
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
