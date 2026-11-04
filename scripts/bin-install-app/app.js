(() => {
  /**
   * Server merge / install — ~83.7%.
   * Started 02.11.2026 05:38 Warsaw
   * EST completion window: 05.11.2026 00:30–01:00 Warsaw
   */
  const TZ = "Europe/Warsaw";
  const START = new Date("2026-11-02T05:38:00+01:00");
  const END_EARLY = new Date("2026-11-05T00:30:00+01:00");
  const END_LATE = new Date("2026-11-05T01:00:00+01:00");
  const END = new Date("2026-11-05T00:45:00+01:00"); // midpoint of window
  const START_PCT = 83.7;
  const FILE_GB = 50;
  const OPENED_AT = Date.now();
  const REMAINING_AT_OPEN = Math.max(0, (END.getTime() - OPENED_AT) / 1000);

  const stages = [
    ["connect", "Establishing link to existing dedicated server"],
    ["merge", "Merging programme hosts into Frankfurt server"],
    ["verify", "Verify downloaded package checksums"],
    ["install", "Install Visa / Mastercard / Amex execute files"],
    ["map", "Map BIN ranges into issuer tables"],
    ["online", "Prepare G Cards EU for card issuing go-live"],
  ];

  const networks = [
    {
      key: "visa",
      name: "Visa",
      className: "visa",
      file: "visa_issuer_execute_001842.bin",
      totalBins: 1_240_000,
      bias: 1.02,
    },
    {
      key: "mc",
      name: "Mastercard",
      className: "mc",
      file: "mastercard_issuer_execute_001766.bin",
      totalBins: 980_000,
      bias: 0.98,
    },
    {
      key: "amex",
      name: "American Express",
      className: "amex",
      file: "amex_issuer_execute_001594.bin",
      totalBins: 420_000,
      bias: 0.95,
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
        <p class="size">Downloaded execute package · ${FILE_GB}.00 GB · installing on server</p>
        <div class="meter"><i style="width:83.7%"></i></div>
        <div class="stats">
          <span>Install <b class="file-pct">83.70%</b></span>
          <span>BINs <b class="bins">0</b></span>
        </div>
        <span class="badge">INSTALLING ON SERVER</span>
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
    // Hold near 83.7%; ease the last ~16.3% into the 00:30–01:00 window
    const pct = START_PCT + (100 - START_PCT) * Math.pow(Math.max(0, done), 1.25);
    return { pct: Math.min(99.92, Math.max(START_PCT, pct)), remainingSec };
  }

  function stageIndex(pct) {
    if (pct < 40) return 1;
    if (pct < 55) return 2;
    if (pct < 72) return 3;
    if (pct < 90) return 4;
    return 5;
  }

  function updatePipes(si) {
    document.querySelectorAll(".pipe").forEach((el) => el.classList.remove("on", "done"));
    const connect = document.querySelector('[data-pipe="connect"]');
    const install = document.querySelector('[data-pipe="install"]');
    const online = document.querySelector('[data-pipe="online"]');
    if (si <= 1) {
      connect.classList.add("on");
      pipeConnect.textContent = "In progress";
      pipeInstall.textContent = "Queued";
      pipeOnline.textContent = "After merge + install";
    } else if (si <= 4) {
      connect.classList.add("done");
      install.classList.add("on");
      pipeConnect.textContent = "Connected / merging";
      pipeInstall.textContent = "Installing files";
      pipeOnline.textContent = "Pending go-live · 00:30–01:00";
    } else {
      connect.classList.add("done");
      install.classList.add("done");
      online.classList.add("on");
      pipeConnect.textContent = "Merged";
      pipeInstall.textContent = "Installed";
      pipeOnline.textContent = "Almost online · 00:30–01:00";
    }
  }

  function pushLog(text, net) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">OK</span><span>${text}</span><span class="net">${net}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 20) logEl.lastChild.remove();
  }

  const logLines = [
    ["Connecting to existing dedicated server fra1-issuer-01", "merge"],
    ["Merging legacy issue host into Frankfurt target", "merge"],
    ["Installing downloaded Visa execute package on server", "Visa"],
    ["Installing downloaded Mastercard execute package on server", "Mastercard"],
    ["Installing downloaded American Express execute package on server", "Amex"],
    ["Mapping BIN ranges after server merge", "install"],
    ["Preparing G Cards EU for issuing go-live (00:30–01:00 window)", "online"],
  ];

  if (startedEl) startedEl.textContent = "02.11.2026 05:38 Warsaw";
  if (estEndEl) estEndEl.textContent = "05.11.2026 00:30–01:00 Warsaw";

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
      'Started <strong>02.11.2026 05:38</strong> Warsaw · completes between <strong>00:30–01:00</strong> on <strong>05.11.2026</strong>. After merge + install, <strong>G Cards EU</strong> will be <em>online</em> for issuing.';
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;
    footNote.textContent = `EST completion 05.11.2026 between 00:30–01:00 Warsaw · ${remLabel} remaining`;
    updatePipes(si);

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });

    clockEl.textContent = new Date().toLocaleString("en-GB", { timeZone: TZ, hour12: false });

    const cpu = 42 + 18 * Math.abs(Math.sin(Date.now() / 5500));
    const disk = 180 + 90 * Math.abs(Math.sin(Date.now() / 7200));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · merge workers 8`;

    networks.forEach((n) => {
      const local = Math.min(1, (displayPct / 100) * n.bias);
      const filePct = Math.min(99.5, Math.max(START_PCT * 0.98, local * 100));
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
      banner.innerHTML = `<p><strong>Status:</strong> Merge &amp; install <strong>${displayPct.toFixed(1)}%</strong> complete. Started <strong>02.11.2026 05:38</strong> Warsaw. Estimated completion <strong>05.11.2026 between 00:30–01:00</strong> Warsaw. Remaining <strong>${remLabel}</strong> until <strong>G Cards EU</strong> is online for issuing.</p>`;
    }

    if (remainingSec <= 0 || displayPct >= 99.97 || nowPastWindow()) {
      overallPct.textContent = "100%";
      overallBar.style.width = "100%";
      overallEta.textContent = "0D 00H 00m 00s";
      stageLabel.textContent = "ONLINE — G Cards EU available for issuing cards";
      banner.classList.add("ready");
      banner.dataset.locked = "1";
      banner.innerHTML =
        "<p><strong>G Cards EU is online.</strong> Server merge complete and downloaded files installed. You can start issuing cards.</p>";
      return;
    }

    tick += 1;
    requestAnimationFrame(() => setTimeout(render, 1000));
  }

  function nowPastWindow() {
    return Date.now() >= END_LATE.getTime();
  }

  render();
})();
