import { useEffect, useState } from "react";
import { getChain, isSupportedLiveChain, isTronAddress } from "./lib/chains";
import {
  addTokenToMetaMask,
  connectWallet,
  METAMASK_INSTALL_URL,
  shortAddress,
  subscribeWalletEvents,
  switchChain,
} from "./lib/ethereum";
import { parseReceiveShare, type SharedToken } from "./lib/tokenShare";
import type { Address } from "viem";
import "./App.css";

type Props = {
  initial?: SharedToken | null;
};

export default function ReceivePage({ initial = null }: Props) {
  const [token] = useState<SharedToken | null>(() => initial ?? parseReceiveShare());
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number>(token?.chainId ?? 1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    subscribeWalletEvents({
      onAccounts: (accounts) => setAccount(accounts[0] ? (accounts[0] as Address) : null),
      onChain: (id) => setChainId(id),
    }).then((fn) => {
      unsub = fn;
    });
    return () => unsub?.();
  }, []);

  if (!token) {
    return (
      <div className="page">
        <div className="atmosphere" aria-hidden />
        <main className="shell">
          <section className="panel">
            <h2>Invalid receive link</h2>
            <p className="hint">
              Ask the sender for a RelayMark receive link (MetaMask <code>0x</code> token on a live
              EVM network). TRON <code>T…</code> addresses are not supported in MetaMask.
            </p>
            <a className="btn ghost" href="#/">
              Back to desk
            </a>
          </section>
        </main>
      </div>
    );
  }

  const chain = getChain(token.chainId);
  const wrongNetwork = account && chainId !== token.chainId;

  async function onConnect() {
    setError("");
    setBusy(true);
    try {
      const { address, chainId: id } = await connectWallet();
      setAccount(address);
      if (id !== token!.chainId) {
        await switchChain(token!.chainId);
        setChainId(token!.chainId);
      } else {
        setChainId(id);
      }
      setStatus("MetaMask connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddToken() {
    const current = token;
    if (!current) return;
    if (!account) {
      setError("Connect MetaMask first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (!isSupportedLiveChain(chainId) || chainId !== current.chainId) {
        await switchChain(current.chainId);
        setChainId(current.chainId);
      }
      await addTokenToMetaMask({
        address: current.address,
        symbol: current.symbol,
        image: current.logo || undefined,
      });
      setAdded(true);
      setStatus(
        "Token added in MetaMask — it will show with your other tokens after you receive a balance.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add token");
    } finally {
      setBusy(false);
    }
  }

  async function onCopyAddress() {
    if (!account) return;
    if (isTronAddress(account)) {
      setError("This wallet address is not an EVM MetaMask address.");
      return;
    }
    await navigator.clipboard.writeText(account);
    setCopied(true);
    setStatus("Address copied — send this 0x address to the team so they can transfer tokens.");
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <header className="top">
        <div className="brand">
          <span className="mark">RM</span>
          <div>
            <p className="brand-name">RelayMark</p>
            <p className="brand-sub">Receive with MetaMask</p>
          </div>
        </div>
        <button type="button" className="btn primary" onClick={onConnect} disabled={busy}>
          {account ? shortAddress(account) : "Connect MetaMask"}
        </button>
      </header>

      <main className="shell">
        <section className="hero">
          <h1>{token.name}</h1>
          <p className="lede">
            Connect MetaMask, add <strong>{token.symbol}</strong> so it appears in your wallet, then
            copy your <code>0x</code> address and send it to the team. They will transfer on{" "}
            {chain?.label ?? "the network"}.
          </p>
          <p className="note">
            MetaMask ↔ MetaMask only on this live chain. Do not send a TRON <code>T…</code> address —
            it cannot receive this ERC-20.
          </p>
        </section>

        <section className="panel token-card">
          <div className="token-head">
            {token.logo ? (
              <img src={token.logo} alt="" className="token-logo" />
            ) : (
              <div className="token-logo fallback">{token.symbol.slice(0, 2)}</div>
            )}
            <div>
              <h2>{token.name}</h2>
              <p>
                {token.symbol} · {chain?.label}
                {token.displayPrice ? ` · ${token.displayPrice}` : ""}
              </p>
              <p className="hint mono">{token.address}</p>
            </div>
          </div>

          <ol className="steps">
            <li>Connect MetaMask (same network: {chain?.label}).</li>
            <li>Add the token so MetaMask shows logo + symbol like your other tokens.</li>
            <li>Copy your wallet address and message it to the sender.</li>
            <li>After they send, your {token.symbol} balance updates in MetaMask.</li>
          </ol>

          {wrongNetwork ? (
            <p className="status err">
              Switch MetaMask to {chain?.label}.{" "}
              <button type="button" className="btn ghost" disabled={busy} onClick={() => switchChain(token.chainId).then(() => setChainId(token.chainId))}>
                Switch network
              </button>
            </p>
          ) : null}

          <div className="actions stack">
            {!account ? (
              <button type="button" className="btn primary" onClick={onConnect} disabled={busy}>
                1. Connect MetaMask
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={onAddToken} disabled={busy}>
                {added ? "Token added — add again" : "2. Add token to MetaMask"}
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={onCopyAddress}
              disabled={busy || !account}
            >
              {copied ? "Copied" : "3. Copy my 0x address for the sender"}
            </button>
          </div>

          {account ? (
            <p className="balance mono">
              Your receive address: <strong>{account}</strong>
            </p>
          ) : (
            <p className="hint">
              Need the extension?{" "}
              <a href={METAMASK_INSTALL_URL} target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
            </p>
          )}
        </section>

        {status ? <p className="status ok">{status}</p> : null}
        {error ? <p className="status err">{error}</p> : null}

        <p className="hint">
          <a href="#/">Sender desk</a> — deploy / paste address / send
        </p>
      </main>
    </div>
  );
}
