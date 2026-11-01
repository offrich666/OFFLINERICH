(() => {
  /** Merge + install window until G Cards is online for issuing. */
  const START_PCT = 18;
  const DURATION_H = 48;
  const FILE_GB = 50;
  const startedAt = Date.now();

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

  stagesEl.innerHTML = stages
    .map(([id]) => `<li data-stage="${id}">${id}</li>`)
    .join("");

  filesEl.innerHTML = networks
    .map(
      (n) => `<article class="file ${n.className}" data-net="${n.key}">
        <p class="file-net">${n.name}</p>
        <h2>${n.file}</h2>
        <p class="size">Downloaded execute package · ${FILE_GB}.00 GB · installing on server</p>
        <div class="meter"><i style="width:18%"></i></div>
        <div class="stats">
          <span>Install <b class="file-pct">18.00%</b></span>
          <span>BINs <b class="bins">0</b></span>
        </div>
        <span class="badge">INSTALLING ON SERVER</span>
      </article>`,
    )
    .join("");

  function fmtHms(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${String(h % 24).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
    }
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }

  function progress() {
    const elapsed = Date.now() - startedAt;
    const duration = DURATION_H * 3600 * 1000;
    const t = Math.min(1, Math.max(0, elapsed / duration));
    const eased = 1 - (1 - t) ** 1.1;
    const pct = START_PCT + (100 - START_PCT) * eased;
    const remaining = Math.max(0, duration - elapsed);
    return { pct: Math.min(99.96, pct), remaining };
  }

  function stageIndex(pct) {
    if (pct < 28) return 0;
    if (pct < 40) return 1;
    if (pct < 52) return 2;
    if (pct < 70) return 3;
    if (pct < 88) return 4;
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
      pipeOnline.textContent = "After ~48h";
    } else if (si <= 4) {
      connect.classList.add("done");
      install.classList.add("on");
      pipeConnect.textContent = "Connected";
      pipeInstall.textContent = "Installing files";
      pipeOnline.textContent = "Pending go-live";
    } else {
      connect.classList.add("done");
      install.classList.add("done");
      online.classList.add("on");
      pipeConnect.textContent = "Merged";
      pipeInstall.textContent = "Installed";
      pipeOnline.textContent = "Almost online";
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
    ["Preparing G Cards EU for issuing go-live", "online"],
  ];

  let tick = 0;
  function render() {
    const { pct, remaining } = progress();
    const si = stageIndex(pct);
    const [sid, slabel] = stages[si];

    overallPct.textContent = `${pct.toFixed(2)}%`;
    overallBar.style.width = `${pct}%`;
    overallEta.textContent = fmtHms(remaining);
    goLiveNote.innerHTML =
      'After merge + install, <strong>G Cards EU</strong> will be <em>online</em> to start using and issuing cards.';
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;
    footNote.textContent = `Go-live after merge and file install · ${fmtHms(remaining)} remaining`;
    updatePipes(si);

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });

    clockEl.textContent = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Warsaw",
      hour12: false,
    });

    const cpu = 30 + 16 * Math.abs(Math.sin(Date.now() / 5500));
    const disk = 140 + 70 * Math.abs(Math.sin(Date.now() / 7200));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · merge workers 8`;

    networks.forEach((n, i) => {
      const local = Math.min(1, (pct / 100) * n.bias);
      const filePct = Math.min(99.5, local * 100 + Math.sin(Date.now() / 4000 + i) * 0.35);
      const bins = Math.floor(n.totalBins * local);
      const card = filesEl.querySelector(`[data-net="${n.key}"]`);
      if (!card) return;
      card.querySelector(".meter i").style.width = `${filePct}%`;
      card.querySelector(".file-pct").textContent = `${filePct.toFixed(2)}%`;
      card.querySelector(".bins").textContent = `${bins.toLocaleString()} / ${n.totalBins.toLocaleString()}`;
    });

    if (tick % 2 === 0) {
      const line = logLines[tick % logLines.length];
      pushLog(line[0], line[1]);
    }

    if (pct >= 99.97) {
      overallPct.textContent = "100%";
      overallBar.style.width = "100%";
      overallEta.textContent = "00h 00m 00s";
      stageLabel.textContent = "ONLINE — G Cards EU available for issuing cards";
      pipeConnect.textContent = "Merged";
      pipeInstall.textContent = "Installed";
      pipeOnline.textContent = "Online";
      document.querySelectorAll(".pipe").forEach((el) => {
        el.classList.remove("on");
        el.classList.add("done");
      });
      document.querySelector('[data-pipe="online"]').classList.add("on");
      banner.classList.add("ready");
      banner.innerHTML =
        "<p><strong>G Cards EU is online.</strong> Server merge complete and downloaded files installed. You can start using the platform and issuing cards. If needed, finish connecting to the dedicated server from the admin desk.</p>";
      goLiveNote.innerHTML = "<em>Online</em> — ready to issue cards.";
      footNote.textContent = "G Cards EU online · issuing available";
      return;
    }

    tick += 1;
    requestAnimationFrame(() => setTimeout(render, 1100));
  }

  render();
})();
