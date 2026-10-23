const $ = (id) => document.getElementById(id);

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
  $("buyBtn").disabled = busy;
  $("sellBtn").disabled = busy;
  $("refreshBtn").disabled = busy;
}

async function refreshWallet() {
  $("walletError").hidden = true;
  try {
    const w = await api("/api/wallet");
    $("walletAddr").textContent = w.publicKey;
    $("walletBal").textContent = `${w.balanceSol.toFixed(4)} SOL`;
    $("buyCap").textContent = `${w.maxBuySol} SOL`;
    $("rpcBadge").textContent = w.rpcConnected ? `RPC ok · slot ${w.slot}` : "RPC issue";
    $("rpcBadge").className = `badge ${w.rpcConnected ? "ok" : "warn"}`;
    $("modeBadge").textContent = w.dryRun ? "DRY RUN" : "LIVE TRADING";
    $("modeBadge").className = `badge ${w.dryRun ? "warn" : "live"}`;
  } catch (err) {
    $("walletError").hidden = false;
    $("walletError").textContent = err.message;
    $("rpcBadge").textContent = "Wallet not ready";
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
          `<li><strong>${l.action}</strong> ${l.ok ? "ok" : "fail"} · ${l.mint.slice(0, 8)}… · ${l.detail}</li>`
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

async function buy() {
  setBusy(true);
  try {
    const result = await api("/api/buy", {
      method: "POST",
      body: JSON.stringify({
        mint: $("mint").value.trim(),
        solAmount: Number($("solAmount").value),
        slippageBps: Number($("slippage").value),
      }),
    });
    showOut(result);
    await refreshLogs();
    await refreshWallet();
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
      }),
    });
    showOut(result);
    await refreshLogs();
    await refreshWallet();
  } catch (err) {
    showOut({ error: err.message });
    await refreshLogs();
  } finally {
    setBusy(false);
  }
}

$("refreshBtn").addEventListener("click", () => {
  refreshWallet();
  refreshLogs();
});
$("buyBtn").addEventListener("click", buy);
$("sellBtn").addEventListener("click", sell);

refreshWallet();
refreshLogs();
setInterval(() => {
  refreshWallet();
  refreshLogs();
}, 20000);