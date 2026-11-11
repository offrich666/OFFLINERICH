import { connection } from "next/server";
import Link from "next/link";
import { listConnectedWallets } from "@/lib/connectedWallets";

type Props = {
  searchParams: Promise<{ key?: string }>;
};

export default async function OpsWalletsPage({ searchParams }: Props) {
  await connection();
  const { key } = await searchParams;
  const expected = process.env.OPS_SECRET || "";

  if (!expected || key !== expected) {
    return (
      <main className="page checkout-page">
        <section className="checkout-layout">
          <div className="setup-panel">
            <h2>Ops access required</h2>
            <p>
              Open <code>/ops/wallets?key=YOUR_OPS_SECRET</code> after setting{" "}
              <code>OPS_SECRET</code> in env.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const wallets = await listConnectedWallets();

  return (
    <main className="page checkout-page">
      <section className="checkout-layout" style={{ gridTemplateColumns: "1fr" }}>
        <div className="checkout-copy">
          <p className="eyebrow">Ops</p>
          <h1>Connected wallets</h1>
          <p>
            Addresses users connected on <code>/tokens</code>, with a signed
            ownership proof. Private keys are never stored — only address +
            signature + last-seen balance snapshot.
          </p>
          <p>
            <Link href={`/ops/transfers?key=${encodeURIComponent(expected)}`}>
              Transfer queue
            </Link>
          </p>
        </div>

        <div className="ops-table-wrap">
          {wallets.length === 0 ? (
            <div className="setup-panel">No connected wallets yet.</div>
          ) : (
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Label</th>
                  <th>Balance</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.id}>
                    <td>
                      {w.chain}
                      {w.chainId != null ? ` · ${w.chainId}` : ""}
                    </td>
                    <td>
                      <code>{w.address}</code>
                    </td>
                    <td>{w.label || "—"}</td>
                    <td>{w.balanceNative || "—"}</td>
                    <td>
                      {new Date(w.firstSeenAt).toLocaleString("en-GB", {
                        timeZone: "Europe/Warsaw",
                      })}
                    </td>
                    <td>
                      {new Date(w.lastSeenAt).toLocaleString("en-GB", {
                        timeZone: "Europe/Warsaw",
                      })}
                    </td>
                    <td className="ops-notes">
                      <code title={w.proofSignature}>
                        {w.proofSignature.slice(0, 18)}…
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
