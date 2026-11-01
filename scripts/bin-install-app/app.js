(() => {
  const START_PCT = 12;
  const DURATION_H = 24;
  const FILE_GB = 50;
  const startedAt = Date.now();

  const stages = [
    ["verify", "Verify package checksums"],
    ["unpack", "Unpack execute packages on server"],
    ["map", "Map BIN ranges into issuer tables"],
    ["index", "Build BIN lookup indexes"],
    ["schema", "Apply card-programme schema patches"],
    ["activate", "Stage network activation flags"],
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
  const stageLabel = document.getElementById("stage-label");
  const stagesEl = document.getElementById("stages");
  const filesEl = document.getElementById("files");
  const logEl = document.getElementById("log");
  const clockEl = document.getElementById("clock");
  const loadEl = document.getElementById("server-load");

  stagesEl.innerHTML = stages
    .map(([id, label]) => `<li data-stage="${id}" title="${label}">${id}</li>`)
    .join("");

  filesEl.innerHTML = networks
    .map(
      (n) => `<article class="file ${n.className}" data-net="${n.key}">
        <p class="file-net">${n.name}</p>
        <h2>${n.file}</h2>
        <p class="size">Execute package · ${FILE_GB}.00 GB</p>
        <div class="meter"><i style="width:12%"></i></div>
        <div class="stats">
          <span>File <b class="file-pct">12.00%</b></span>
          <span>BINs <b class="bins">0</b></span>
        </div>
        <span class="badge">INSTALLING</span>
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
    const eased = 1 - (1 - t) ** 1.12;
    const pct = START_PCT + (100 - START_PCT) * eased;
    const remaining = Math.max(0, duration - elapsed);
    return { pct: Math.min(99.96, pct), remaining };
  }

  function stageIndex(pct) {
    if (pct < 25) return 0;
    if (pct < 40) return 1;
    if (pct < 58) return 2;
    if (pct < 78) return 3;
    if (pct < 90) return 4;
    return 5;
  }

  function pushLog(net, file, stage) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">OK</span><span>installing ${file}</span><span class="net">${net} · ${stage}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 18) logEl.lastChild.remove();
  }

  let tick = 0;
  function render() {
    const { pct, remaining } = progress();
    const si = stageIndex(pct);
    const [sid, slabel] = stages[si];

    overallPct.textContent = `${pct.toFixed(2)}%`;
    overallBar.style.width = `${pct}%`;
    overallEta.textContent = fmtHms(remaining);
    stageLabel.textContent = `${sid.toUpperCase()} — ${slabel}`;

    stagesEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("on", i === si);
      li.classList.toggle("done", i < si);
    });

    const now = new Date();
    clockEl.textContent = now.toLocaleString("en-GB", {
      timeZone: "Europe/Warsaw",
      hour12: false,
    });

    const cpu = 28 + 18 * Math.abs(Math.sin(Date.now() / 5500));
    const disk = 120 + 80 * Math.abs(Math.sin(Date.now() / 7200));
    loadEl.textContent = `CPU ${cpu.toFixed(1)}% · disk ${disk.toFixed(0)} MB/s · workers 8`;

    networks.forEach((n, i) => {
      const local = Math.min(1, (pct / 100) * n.bias);
      const filePct = Math.min(99.5, local * 100 + Math.sin(Date.now() / 4000 + i) * 0.4);
      const bins = Math.floor(n.totalBins * local);
      const card = filesEl.querySelector(`[data-net="${n.key}"]`);
      if (!card) return;
      card.querySelector(".meter i").style.width = `${filePct}%`;
      card.querySelector(".file-pct").textContent = `${filePct.toFixed(2)}%`;
      card.querySelector(".bins").textContent = `${bins.toLocaleString()} / ${n.totalBins.toLocaleString()}`;
      if (tick % 3 === i) {
        pushLog(n.name, n.file, sid);
      }
    });

    tick += 1;
    if (pct >= 99.97) {
      overallPct.textContent = "100%";
      overallBar.style.width = "100%";
      overallEta.textContent = "00h 00m 00s";
      stageLabel.textContent = "DONE — Contact API and code provider to activate BINs on your platforms";
      return;
    }
    requestAnimationFrame(() => setTimeout(render, 1100));
  }

  render();
})();
