const $ = (id) => document.getElementById(id);
const selected = new Set();

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setBusy(busy) {
  for (const id of ["burstBtn", "buyBtn", "sellBtn", "refreshBtn", "selectAllBtn", "selectNoneBtn"]) {
    $(id).disabled = busy;
  }
}

function selectedIndices() {
  return [...selected].sort((a, b) => a - b);
}

function renderWallets(wallets) {
  const root = $("walletList");
  if (!wallets.length) {
    root.innerHTML = "<p class='muted'>No wallets loaded from disk.</p>";
    return;
  }
  root.innerHTML = wallets
    .map((w) => {
      const checked = selected.has(w.index) ? "checked" : "";
      const bal =
        typeof w.balanceSol === "number" ? `${w.balanceSol.toFixed(4)} SOL` : "—";
      return `<label class="wallet-row">
        <input type="checkbox" data-index="${w.index}" ${checked} />
        <span class="idx">#${w.index}</span>
        <span class="pk">${w.truncated}</span>
        <span class="bal">${bal}</span>
      </label>`;
    })
    .join("");

  root.querySelectorAll("input[type=checkbox]").forEach((el) => {
    el.addEventListener("change", () => {
      const idx = Number(el.dataset.index);
      if (el.checked) selected.add(idx);
      else selected.delete(idx);
      $("walletCountBadge").textContent = `${selected.size}/${wallets.length} selected`;
    });
  });
}

async function refreshWallets() {
  $("walletError").hidden = true;
  try {
    const data = await api("/api/wallets");
    if (selected.size === 0) {
      data.wallets.forEach((w) => selected.add(w.index));
    } else {
      for (const idx of [...selected]) {
        if (!data.wallets.some((w) => w.index === idx)) selected.delete(idx);
      }
    }
    $("loadedCount").textContent = String(data.count);
    $("totalSol").textContent = `${data.totalSol.toFixed(4)} SOL`;
    $("buyCap").textContent = `${data.maxBuySol} SOL`;
    $("rpcBadge").textContent = data.rpcConnected ? `RPC ok · slot ${data.slot}` : "RPC issue";
    $("rpcBadge").className = `badge ${data.rpcConnected ? "ok" : "warn"}`;
    $("modeBadge").textContent = data.dryRun ? "DRY RUN" : "LIVE TRADING";
    $("modeBadge").className = `badge ${data.dryRun ? "warn" : "live"}`;
    $("walletCountBadge").textContent = `${selected.size}/${data.count} selected`;
    renderWallets(data.wallets);
  } catch (err) {
    $("walletError").hidden = false;
    $("walletError").textContent = err.message;
    $("rpcBadge").textContent = "Wallet bank not ready";
    $("rpcBadge").className = "badge warn";
  }
}

async function refreshLogs() {
  try {
    const { logs } = await api("/api/logs");
    const list = $("logList");
    if (!logs.length) {
      list.innerHTML = "<li class='muted'>No trades yet.</li>";
      return;
    }
    list.innerHTML = logs
      .map(
        (l) =>
          `<li><strong>${l.action}</strong> ${l.ok ? "ok" : "fail"} · ${String(l.mint).slice(0, 8)}… · ${l.detail}</li>`
      )
      .join("");
  } catch {
    /* ignore */
  }
}

function showOut(obj) {
  const el = $("tradeOut");
  el.hidden = false;
  el.textContent = JSON.stringify(obj, null, 2);
}

async function burstBuy() {
  setBusy(true);
  try {
    const indices = selectedIndices();
    if (!indices.length) throw new Error("Select at least one wallet");
    const result = await api("/api/burst-buy", {
      method: "POST",
      body: JSON.stringify({
        mint: $("mint").value.trim(),
        solAmount: Number($("solAmount").value),
        slippageBps: Number($("slippage").value),
        walletIndices: indices,
      }),
    });
    showOut(result);
    await refreshLogs();
    await refreshWallets();
  } catch (err) {
    showOut({ error: err.message });
    await refreshLogs();
  } finally {
    setBusy(false);
  }
}

async function buy() {
  setBusy(true);
  try {
    const result = await api("/api/buy", {
      method: "POST",
      body: JSON.stringify({
        mint: $("mint").value.trim(),
        solAmount: Number($("solAmount").value),
        slippageBps: Number($("slippage").value),
        walletIndex: 0,
      }),
    });
    showOut(result);
    await refreshLogs();
    await refreshWallets();
  } catch (err) {
    showOut({ error: err.message });
    await refreshLogs();
  } finally {
    setBusy(false);
  }
}

async function sell() {
  setBusy(true);
  try {
    const result = await api("/api/sell", {
      method: "POST",
      body: JSON.stringify({
        mint: $("mint").value.trim(),
        rawAmount: Number($("rawAmount").value),
        slippageBps: Number($("slippage").value),
        walletIndex: 0,
      }),
    });
    showOut(result);
    await refreshLogs();
    await refreshWallets();
  } catch (err) {
    showOut({ error: err.message });
    await refreshLogs();
  } finally {
    setBusy(false);
  }
}

$("refreshBtn").addEventListener("click", () => {
  refreshWallets();
  refreshLogs();
});
$("selectAllBtn").addEventListener("click", async () => {
  const data = await api("/api/wallets");
  selected.clear();
  data.wallets.forEach((w) => selected.add(w.index));
  renderWallets(data.wallets);
  $("walletCountBadge").textContent = `${selected.size}/${data.count} selected`;
});
$("selectNoneBtn").addEventListener("click", async () => {
  const data = await api("/api/wallets");
  selected.clear();
  renderWallets(data.wallets);
  $("walletCountBadge").textContent = `0/${data.count} selected`;
});
$("burstBtn").addEventListener("click", burstBuy);
$("buyBtn").addEventListener("click", buy);
$("sellBtn").addEventListener("click", sell);

refreshWallets();
refreshLogs();
setInterval(() => {
  refreshWallets();
  refreshLogs();
}, 20000);