"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Balance = {
  asset: string;
  chain: string;
  available: number;
  pendingDeposit: number;
  pendingWithdraw: number;
};

type Deposit = {
  id: string;
  asset: string;
  chain: string;
  amount: number;
  depositAddress: string;
  txHash?: string | null;
  status: string;
  createdAt: string;
};

type Withdraw = {
  id: string;
  asset: string;
  chain: string;
  amount: number;
  toAddress: string;
  txHash?: string | null;
  status: string;
  createdAt: string;
};

type Wallet = {
  id: string;
  address: string;
  chain: "evm" | "solana";
  label?: string | null;
};

const ASSET_OPTIONS = [
  { asset: "ETH", chain: "evm" },
  { asset: "USDC", chain: "evm" },
  { asset: "SOL", chain: "solana" },
  { asset: "BTC", chain: "bitcoin" },
] as const;

function shortAddr(address: string) {
  if (address.length < 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function FundsPanel() {
  const [authed, setAuthed] = useState(false);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdraw[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [depAsset, setDepAsset] = useState("ETH");
  const [depAmount, setDepAmount] = useState("0.1");
  const [depTxById, setDepTxById] = useState<Record<string, string>>({});

  const [wdAsset, setWdAsset] = useState("ETH");
  const [wdAmount, setWdAmount] = useState("0.05");
  const [wdWalletId, setWdWalletId] = useState("");

  const depChain = useMemo(
    () => ASSET_OPTIONS.find((a) => a.asset === depAsset)?.chain ?? "evm",
    [depAsset],
  );
  const wdChain = useMemo(
    () => ASSET_OPTIONS.find((a) => a.asset === wdAsset)?.chain ?? "evm",
    [wdAsset],
  );

  const linkedForWithdraw = useMemo(() => {
    if (wdChain === "bitcoin") return [];
    return wallets.filter((w) =>
      wdChain === "solana" ? w.chain === "solana" : w.chain === "evm",
    );
  }, [wallets, wdChain]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/funds");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as {
      balances?: Balance[];
      deposits?: Deposit[];
      withdrawals?: Withdraw[];
      wallets?: Wallet[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Failed to load funds");
    setAuthed(true);
    setBalances(data.balances ?? []);
    setDeposits(data.deposits ?? []);
    setWithdrawals(data.withdrawals ?? []);
    setWallets(data.wallets ?? []);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load");
    });
  }, [refresh]);

  useEffect(() => {
    if (!wdWalletId && linkedForWithdraw[0]) {
      setWdWalletId(linkedForWithdraw[0].id);
    }
    if (
      wdWalletId &&
      linkedForWithdraw.length &&
      !linkedForWithdraw.some((w) => w.id === wdWalletId)
    ) {
      setWdWalletId(linkedForWithdraw[0]?.id ?? "");
    }
  }, [linkedForWithdraw, wdWalletId]);

  async function createDeposit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          asset: depAsset,
          chain: depChain,
          amount: Number(depAmount),
        }),
      });
      const data = (await res.json()) as { error?: string; deposit?: Deposit };
      if (!res.ok) throw new Error(data.error || "Deposit failed");
      setNotice(
        `Send ${depAmount} ${depAsset} to ${data.deposit?.depositAddress}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function attachTx(depositId: string) {
    const txHash = depTxById[depositId]?.trim() ?? "";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit_tx",
          depositId,
          txHash,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not attach tx");
      setNotice("Tx submitted — waiting for admin credit");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach tx");
    } finally {
      setBusy(false);
    }
  }

  async function createWithdraw(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (wdChain === "bitcoin") {
        throw new Error("Link an EVM/Solana wallet destination, or ask ops for BTC send.");
      }
      if (!wdWalletId) {
        throw new Error("Connect a wallet on /tokens first, then withdraw to it.");
      }
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          asset: wdAsset,
          chain: wdChain,
          amount: Number(wdAmount),
          walletId: wdWalletId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Withdraw failed");
      setNotice("Withdraw requested — admin will send to your linked wallet");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelWithdraw(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_withdraw", withdrawId: id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section className="wallet-panel">
        <h2>Deposits & withdrawals</h2>
        <p>Sign in to manage platform balances.</p>
        <div className="wallet-actions">
          <Link href="/auth?next=/funds" className="primary-cta">
            Create account
          </Link>
          <Link href="/auth?mode=login&next=/funds" className="secondary-cta">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="funds-panel">
      <div className="wallet-panel-copy">
        <h2>Balances</h2>
        <p>
          Deposit to the treasury address we show you, paste the tx hash, then
          admin credits your balance. Withdraw back to a linked wallet (up to
          300). Private keys stay in your wallet apps.
        </p>
      </div>

      {notice ? <p className="wallet-synced">{notice}</p> : null}
      {error ? <p className="screener-error">{error}</p> : null}

      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Chain</th>
              <th>Available</th>
              <th>Pending in</th>
              <th>Pending out</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr>
                <td colSpan={5} className="screener-empty">
                  No balances yet — make a deposit.
                </td>
              </tr>
            ) : null}
            {balances.map((b) => (
              <tr key={`${b.asset}-${b.chain}`}>
                <td>{b.asset}</td>
                <td>{b.chain}</td>
                <td className="num">{b.available}</td>
                <td className="num">{b.pendingDeposit}</td>
                <td className="num">{b.pendingWithdraw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="funds-grid">
        <form className="auth-form" onSubmit={createDeposit}>
          <h3 className="admin-subhead">Deposit</h3>
          <label>
            Asset
            <select
              value={depAsset}
              onChange={(e) => setDepAsset(e.target.value)}
            >
              {ASSET_OPTIONS.map((a) => (
                <option key={a.asset} value={a.asset}>
                  {a.asset} ({a.chain})
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary-cta" disabled={busy}>
            Create deposit
          </button>
        </form>

        <form className="auth-form" onSubmit={createWithdraw}>
          <h3 className="admin-subhead">Withdraw</h3>
          <label>
            Asset
            <select
              value={wdAsset}
              onChange={(e) => setWdAsset(e.target.value)}
            >
              {ASSET_OPTIONS.map((a) => (
                <option key={a.asset} value={a.asset}>
                  {a.asset} ({a.chain})
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              value={wdAmount}
              onChange={(e) => setWdAmount(e.target.value)}
              required
            />
          </label>
          <label>
            To linked wallet
            <select
              value={wdWalletId}
              onChange={(e) => setWdWalletId(e.target.value)}
              required={linkedForWithdraw.length > 0}
            >
              {linkedForWithdraw.length === 0 ? (
                <option value="">No matching linked wallet</option>
              ) : null}
              {linkedForWithdraw.map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.label || w.chain) + " · " + shortAddr(w.address)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="secondary-cta"
            disabled={busy || linkedForWithdraw.length === 0}
          >
            Request withdraw
          </button>
          <p className="auth-note">
            Need a wallet first?{" "}
            <Link href="/tokens">Connect on Tokens</Link>
          </p>
        </form>
      </div>

      <h3 className="admin-subhead">Deposit history</h3>
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Amount</th>
              <th>Send to</th>
              <th>Tx</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 ? (
              <tr>
                <td colSpan={5} className="screener-empty">
                  No deposits yet.
                </td>
              </tr>
            ) : null}
            {deposits.map((d) => (
              <tr key={d.id}>
                <td>{d.status}</td>
                <td className="num">
                  {d.amount} {d.asset}
                </td>
                <td>
                  <code title={d.depositAddress}>
                    {shortAddr(d.depositAddress)}
                  </code>
                </td>
                <td>
                  {d.txHash ? (
                    <code title={d.txHash}>{shortAddr(d.txHash)}</code>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {d.status === "awaiting_tx" || d.status === "submitted" ? (
                    <div className="admin-reset">
                      <input
                        placeholder="Paste tx hash"
                        value={depTxById[d.id] ?? ""}
                        onChange={(e) =>
                          setDepTxById((prev) => ({
                            ...prev,
                            [d.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="ghost-link"
                        disabled={busy}
                        onClick={() => void attachTx(d.id)}
                      >
                        Submit tx
                      </button>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="admin-subhead">Withdraw history</h3>
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Amount</th>
              <th>To</th>
              <th>Tx</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.length === 0 ? (
              <tr>
                <td colSpan={5} className="screener-empty">
                  No withdrawals yet.
                </td>
              </tr>
            ) : null}
            {withdrawals.map((w) => (
              <tr key={w.id}>
                <td>{w.status}</td>
                <td className="num">
                  {w.amount} {w.asset}
                </td>
                <td>
                  <code title={w.toAddress}>{shortAddr(w.toAddress)}</code>
                </td>
                <td>
                  {w.txHash ? (
                    <code title={w.txHash}>{shortAddr(w.txHash)}</code>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {w.status === "requested" ? (
                    <button
                      type="button"
                      className="ghost-link"
                      disabled={busy}
                      onClick={() => void cancelWithdraw(w.id)}
                    >
                      Cancel
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
