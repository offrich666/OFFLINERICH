import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  isEvmAddress,
  isSupportedLiveChain,
  isTronAddress,
} from "./lib/chains";
import {
  addTokenToMetaMask,
  connectWallet,
  deployTeamToken,
  explorerTokenUrl,
  explorerTxUrl,
  METAMASK_INSTALL_URL,
  probeMetaMask,
  readBalance,
  sendToken,
  shortAddress,
  subscribeWalletEvents,
  switchChain,
} from "./lib/ethereum";
import {
  buildReceiveShareUrl,
  loadSavedToken,
  saveToken,
  type TokenState,
} from "./lib/tokenShare";
import type { Address, Hex } from "viem";
import "./App.css";

export default function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number>(DEFAULT_CHAIN_ID);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("RelayMark Team");
  const [symbol, setSymbol] = useState("RMT");
  const [supply, setSupply] = useState("1000000");
  const [logo, setLogo] = useState("");
  const [displayPrice, setDisplayPrice] = useState("");
  const [existingAddress, setExistingAddress] = useState("");

  const [token, setToken] = useState<TokenState | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [lastTx, setLastTx] = useState<Hex | null>(null);
  const [walletReady, setWalletReady] = useState("Checking MetaMask Connect…");
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const saved = loadSavedToken();
    if (saved) {
      setToken(saved);
      setShareUrl(buildReceiveShareUrl(saved));
      if (saved.chainId) setChainId(saved.chainId);
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      const probe = await probeMetaMask();
      if (cancelled) return;
      setWalletReady(probe.detail);
      unsub = await subscribeWalletEvents({
        onAccounts: (accounts) => {
          setAccount(accounts[0] ? (accounts[0] as Address) : null);
        },
        onChain: (id) => setChainId(id),
      });
    })().catch((e) => {
      if (!cancelled) {
        setWalletReady(e instanceof Error ? e.message : "MetaMask Connect failed");
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!token || !account) {
      setBalance("");
      return;
    }
    let cancelled = false;
    const readOn = token.chainId || chainId;
    readBalance(token.address, account, readOn)
      .then((b) => {
        if (!cancelled) setBalance(b);
      })
      .catch(() => {
        if (!cancelled) setBalance("—");
      });
    return () => {
      cancelled = true;
    };
  }, [token, account, chainId, lastTx]);

  function rememberToken(next: TokenState) {
    setToken(next);
    saveToken(next);
    const url = buildReceiveShareUrl(next);
    setShareUrl(url);
    return url;
  }

  async function onCopyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setStatus("Receive link copied — send it to anyone with MetaMask.");
    window.setTimeout(() => setShareCopied(false), 2000);
  }

  async function onConnect() {
    setError("");
    setBusy(true);
    setStatus("Opening MetaMask Connect…");
    try {
      const { address, chainId: id } = await connectWallet();
      setAccount(address);
      if (!isSupportedLiveChain(id)) {
        await switchChain(DEFAULT_CHAIN_ID);
        setChainId(DEFAULT_CHAIN_ID);
        setStatus(`Connected ${shortAddress(address)} on Ethereum (live)`);
      } else {
        setChainId(id);
        setStatus(`Connected ${shortAddress(address)} via MetaMask Connect`);
      }
      setWalletReady("Connected with official MetaMask Connect");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSwitch(next: number) {
    setError("");
    setBusy(true);
    try {
      await switchChain(next);
      setChainId(next);
      setStatus(`Switched network`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network switch failed");
    } finally {
      setBusy(false);
    }
  }

  function onLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) {
      setError("Logo must be under ~400KB for MetaMask image URLs.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setLogo(result);
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function onDeploy(e: FormEvent) {
    e.preventDefault();
    if (!account) {
      setError("Connect MetaMask first.");
      return;
    }
    setError("");
    setBusy(true);
    setStatus("Confirm deploy in MetaMask…");
    try {
      const address = await deployTeamToken({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        initialSupply: supply.trim(),
        account,
        chainId,
      });
      const next: TokenState = {
        address,
        chainId,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        logo,
        displayPrice: displayPrice.trim(),
      };
      rememberToken(next);
      setStatus(`Deployed ${shortAddress(address)} — share the receive link so others can add it in MetaMask.`);
      try {
        await addTokenToMetaMask({
          address,
          symbol: next.symbol,
          image: logo || undefined,
        });
      } catch {
        /* share link still works for recipients */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUseExisting(e: FormEvent) {
    e.preventDefault();
    const addr = existingAddress.trim();
    if (isTronAddress(addr)) {
      setError(
        "That is a TRON address (starts with T). MetaMask only uses EVM 0x addresses. Use TronLink for TRON, or deploy/send an ERC-20 here.",
      );
      return;
    }
    if (!isEvmAddress(addr)) {
      setError("Paste a valid 0x… contract address.");
      return;
    }
    const next: TokenState = {
      address: addr as Address,
      chainId,
      name: name.trim() || "Team Token",
      symbol: symbol.trim().toUpperCase() || "TEAM",
      logo,
      displayPrice: displayPrice.trim(),
    };
    rememberToken(next);
    setStatus(`Using token ${shortAddress(addr)} — share the receive link with MetaMask users.`);
  }

  async function onWatch() {
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      await addTokenToMetaMask({
        address: token.address,
        symbol: token.symbol,
        image: token.logo || logo || undefined,
      });
      setStatus("MetaMask prompted to add the token.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add token");
    } finally {
      setBusy(false);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!account || !token) {
      setError("Connect and select a token first.");
      return;
    }
    const to = recipient.trim();
    if (isTronAddress(to)) {
      setError(
        "Recipient looks like TRON (T…). MetaMask cannot send to TRON. Ask for a 0x MetaMask address on the same chain.",
      );
      return;
    }
    if (!isEvmAddress(to)) {
      setError("Recipient must be a 0x… MetaMask address.");
      return;
    }
    setError("");
    setBusy(true);
    setStatus("Confirm transfer in MetaMask…");
    try {
      const sendChain = token.chainId || chainId;
      if (chainId !== sendChain) {
        await switchChain(sendChain);
        setChainId(sendChain);
      }
      const hash = await sendToken({
        token: token.address,
        to: to as Address,
        amount: amount.trim(),
        account,
        chainId: sendChain,
      });
      setLastTx(hash);
      setStatus(
        `Sent ${amount} ${token.symbol}. After they added the token via your receive link, it shows in their MetaMask like other tokens.`,
      );
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  const chainLabel = CHAINS.find((c) => c.id === chainId)?.label ?? `Chain ${chainId}`;

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <header className="top">
        <div className="brand">
          <span className="mark">RM</span>
          <div>
            <p className="brand-name">RelayMark</p>
            <p className="brand-sub">MetaMask team token desk</p>
          </div>
        </div>
        <button type="button" className="btn primary" onClick={onConnect} disabled={busy}>
          {busy && !account ? "Connecting…" : account ? shortAddress(account) : "Connect MetaMask"}
        </button>
      </header>

      <main className="shell">
        <section className="hero">
          <h1>RelayMark</h1>
          <p className="lede">
            Deploy once, share a receive link, paste their MetaMask <code>0x</code> address, and
            send. They add the token in MetaMask so it shows with their other tokens.
          </p>
          <p className="note">
            MetaMask ↔ MetaMask on one live EVM network (Ethereum / Polygon / Base / BSC). TRON{" "}
            <code>T…</code> addresses cannot receive this ERC-20. Uses official{" "}
            <a href="https://github.com/orgs/MetaMask/repositories" target="_blank" rel="noreferrer">
              MetaMask Connect
            </a>
            .
          </p>
          <p className="hint wallet-hint">
            {walletReady}{" "}
            {!account ? (
              <>
                ·{" "}
                <a href={METAMASK_INSTALL_URL} target="_blank" rel="noreferrer">
                  Install MetaMask
                </a>
              </>
            ) : null}
          </p>
        </section>

        <section className="panel">
          <h2>Live network</h2>
          <p className="hint">
            Current: {chainLabel} · mainnet only (real gas). Deploy and sends use real funds.
          </p>
          <div className="chips">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === chainId ? "chip active" : "chip"}
                disabled={busy || !account}
                onClick={() => onSwitch(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Token + logo</h2>
          <form className="form" onSubmit={onDeploy}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Symbol
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                maxLength={11}
                required
              />
            </label>
            <label>
              Initial supply
              <input
                value={supply}
                onChange={(e) => setSupply(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            <label>
              Team display price (optional, app-only)
              <input
                value={displayPrice}
                onChange={(e) => setDisplayPrice(e.target.value)}
                placeholder="e.g. 1.00 USD — not a MetaMask market price"
              />
            </label>
            <label>
              Logo URL (https… — required for share links)
              <input
                value={logo.startsWith("data:") ? "" : logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://…/logo.png (https so every MetaMask can load it)"
              />
            </label>
            <label className="file">
              Or upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onLogoFile} />
            </label>
            {logo ? (
              <div className="logo-preview">
                <img src={logo} alt="Token logo preview" />
              </div>
            ) : null}
            <div className="actions">
              <button type="submit" className="btn primary" disabled={busy || !account}>
                Deploy with MetaMask
              </button>
            </div>
          </form>

          <form className="form existing" onSubmit={onUseExisting}>
            <label>
              Or paste existing ERC-20 address
              <input
                value={existingAddress}
                onChange={(e) => setExistingAddress(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <button type="submit" className="btn ghost" disabled={busy}>
              Use this token
            </button>
          </form>
        </section>

        {token ? (
          <section className="panel token-card">
            <div className="token-head">
              {token.logo || logo ? (
                <img src={token.logo || logo} alt="" className="token-logo" />
              ) : (
                <div className="token-logo fallback">{token.symbol.slice(0, 2)}</div>
              )}
              <div>
                <h2>{token.name}</h2>
                <p>
                  {token.symbol}
                  {token.displayPrice || displayPrice
                    ? ` · display ${token.displayPrice || displayPrice}`
                    : ""}
                </p>
                <a
                  href={explorerTokenUrl(token.chainId || chainId, token.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(token.address)}
                </a>
              </div>
            </div>
            <p className="balance">
              Your balance: <strong>{balance || "…"}</strong> {token.symbol} ·{" "}
              {CHAINS.find((c) => c.id === (token.chainId || chainId))?.label}
            </p>

            <div className="share-box">
              <h3>1. Share receive link</h3>
              <p className="hint">
                They open this in a browser, connect MetaMask, add the token (logo + symbol), then
                copy their <code>0x</code> address back to you.
              </p>
              <input className="share-input" readOnly value={shareUrl} />
              <div className="actions">
                <button type="button" className="btn primary" onClick={onCopyShare} disabled={!shareUrl}>
                  {shareCopied ? "Link copied" : "Copy receive link"}
                </button>
                <a className="btn ghost" href={shareUrl || "#/receive"}>
                  Open receive page
                </a>
                <button type="button" className="btn ghost" onClick={onWatch} disabled={busy}>
                  Add token in my MetaMask
                </button>
              </div>
            </div>

            <form className="form send" onSubmit={onSend}>
              <h3>2. When they send you their MetaMask address — pay out</h3>
              <label>
                Their MetaMask receive address
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x… from their receive page (not TRON T…)"
                  required
                />
              </label>
              <label>
                Amount
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !account}>
                Send with MetaMask
              </button>
            </form>
            {lastTx ? (
              <p className="tx">
                Last tx:{" "}
                <a
                  href={explorerTxUrl(token.chainId || chainId, lastTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(lastTx)}
                </a>
              </p>
            ) : null}
          </section>
        ) : null}

        {status ? <p className="status ok">{status}</p> : null}
        {error ? <p className="status err">{error}</p> : null}

        <section className="panel footnotes">
          <h2>How it shows in every MetaMask</h2>
          <ul>
            <li>
              Recipients must open your receive link and tap <strong>Add token to MetaMask</strong>{" "}
              once — then logo + symbol appear next to their other tokens. Use an{" "}
              <code>https://</code> logo URL so every wallet can load it.
            </li>
            <li>
              Built-in market price (like USDC) only appears after CoinGecko/CMC + liquidity. Until
              then the token still holds and transfers normally.
            </li>
            <li>
              One network per deploy. Everyone must use the same live chain and MetaMask{" "}
              <code>0x</code> addresses — not TRON.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
