import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { CHAINS, isEvmAddress, isTronAddress } from "./lib/chains";
import {
  addTokenToMetaMask,
  connectWallet,
  deployTeamToken,
  explorerTokenUrl,
  explorerTxUrl,
  getProvider,
  readBalance,
  sendToken,
  shortAddress,
  switchChain,
} from "./lib/ethereum";
import type { Address, Hex } from "viem";
import "./App.css";

type TokenState = {
  address: Address;
  name: string;
  symbol: string;
  logo: string;
  displayPrice: string;
};

const STORAGE_KEY = "relaymark-team-token";

function loadSaved(): TokenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenState) : null;
  } catch {
    return null;
  }
}

function saveToken(token: TokenState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

export default function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number>(11155111);
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

  useEffect(() => {
    const saved = loadSaved();
    if (saved) setToken(saved);

    const provider = getProvider();
    if (!provider?.on) return;

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAccount(list[0] ? (list[0] as Address) : null);
    };
    const onChain = (hex: unknown) => {
      setChainId(Number.parseInt(String(hex), 16));
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  useEffect(() => {
    if (!token || !account) {
      setBalance("");
      return;
    }
    let cancelled = false;
    readBalance(token.address, account, chainId)
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

  async function onConnect() {
    setError("");
    setBusy(true);
    try {
      const { address, chainId: id } = await connectWallet();
      setAccount(address);
      setChainId(id);
      setStatus(`Connected ${shortAddress(address)}`);
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
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        logo,
        displayPrice: displayPrice.trim(),
      };
      setToken(next);
      saveToken(next);
      setStatus(`Token deployed at ${shortAddress(address)}`);
      try {
        await addTokenToMetaMask({
          address,
          symbol: next.symbol,
          image: logo || undefined,
        });
        setStatus(`Deployed and added to MetaMask: ${shortAddress(address)}`);
      } catch {
        setStatus(`Deployed ${shortAddress(address)} — add to MetaMask manually if needed.`);
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
      name: name.trim() || "Team Token",
      symbol: symbol.trim().toUpperCase() || "TEAM",
      logo,
      displayPrice: displayPrice.trim(),
    };
    setToken(next);
    saveToken(next);
    setStatus(`Using token ${shortAddress(addr)}`);
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
      const hash = await sendToken({
        token: token.address,
        to: to as Address,
        amount: amount.trim(),
        account,
        chainId,
      });
      setLastTx(hash);
      setStatus(`Sent ${amount} ${token.symbol}`);
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
          {account ? shortAddress(account) : "Connect MetaMask"}
        </button>
      </header>

      <main className="shell">
        <section className="hero">
          <h1>RelayMark</h1>
          <p className="lede">
            Create a team ERC-20, attach a logo, add it in MetaMask, and send to 0x
            addresses on the same network.
          </p>
          <p className="note">
            MetaMask does not support TRON. TRON <code>T…</code> addresses will not work here —
            use an EVM chain (Ethereum, Polygon, Base, BSC) and MetaMask <code>0x…</code> wallets.
          </p>
        </section>

        <section className="panel">
          <h2>Network</h2>
          <p className="hint">Current: {chainLabel}</p>
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
              Logo URL (https…)
              <input
                value={logo.startsWith("data:") ? "" : logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://…/logo.png"
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
                <a href={explorerTokenUrl(chainId, token.address)} target="_blank" rel="noreferrer">
                  {shortAddress(token.address)}
                </a>
              </div>
            </div>
            <p className="balance">
              Your balance: <strong>{balance || "…"}</strong> {token.symbol}
            </p>
            <button type="button" className="btn ghost" onClick={onWatch} disabled={busy}>
              Add logo + token to MetaMask
            </button>

            <form className="form send" onSubmit={onSend}>
              <h3>Send via MetaMask</h3>
              <label>
                Recipient MetaMask address
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x… (not a TRON T… address)"
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
                <a href={explorerTxUrl(chainId, lastTx)} target="_blank" rel="noreferrer">
                  {shortAddress(lastTx)}
                </a>
              </p>
            ) : null}
          </section>
        ) : null}

        {status ? <p className="status ok">{status}</p> : null}
        {error ? <p className="status err">{error}</p> : null}

        <section className="panel footnotes">
          <h2>About logos &amp; price</h2>
          <ul>
            <li>
              MetaMask shows your logo when the token is added with{" "}
              <code>wallet_watchAsset</code> (button above). A public https logo URL is more
              reliable than a local upload.
            </li>
            <li>
              MetaMask market price appears only after aggregators list the token (liquidity +
              CoinGecko/CoinMarketCap). The optional “display price” here is for your team UI
              only.
            </li>
            <li>
              Trust Wallet’s{" "}
              <a
                href="https://github.com/trustwallet/assets/tree/master/blockchains"
                target="_blank"
                rel="noreferrer"
              >
                assets repo
              </a>{" "}
              is a separate listing PR for Trust Wallet — it does not make a token MetaMask-only
              or set its price.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
