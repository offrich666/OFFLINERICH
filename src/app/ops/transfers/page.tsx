import { connection } from "next/server";
import { listTransferOrders } from "@/lib/orders";
import { MarkSentForm } from "@/components/MarkSentForm";

type Props = {
  searchParams: Promise<{ key?: string }>;
};

export default async function OpsTransfersPage({ searchParams }: Props) {
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
              Open <code>/ops/transfers?key=YOUR_OPS_SECRET</code> after setting{" "}
              <code>OPS_SECRET</code> in env. Onramp orders deliver direct to
              the client wallet; legacy fiat rows may still need a manual send.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const orders = await listTransferOrders();

  return (
    <main className="page checkout-page">
      <section className="checkout-layout" style={{ gridTemplateColumns: "1fr" }}>
        <div className="checkout-copy">
          <p className="eyebrow">Ops</p>
          <h1>Transfer queue</h1>
          <p>
            Instant Onramp → <code>sent_to_client</code> when Stripe delivers.
            Easy card → <code>paid_pending_treasury</code>: fund treasury, send
            to <code>clientWallet</code>, mark sent.
          </p>
        </div>

        <div className="ops-table-wrap">
          {orders.length === 0 ? (
            <div className="setup-panel">No transfer orders yet.</div>
          ) : (
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Network / asset</th>
                  <th>Client wallet</th>
                  <th>Treasury (internal)</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <code>{o.status}</code>
                    </td>
                    <td>
                      {(o.amountCents / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: o.currency.toUpperCase(),
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td>
                      {o.network} / {o.asset}
                    </td>
                    <td>
                      <code className="break">{o.clientWallet}</code>
                    </td>
                    <td>
                      <code className="break">{o.treasuryWallet}</code>
                    </td>
                    <td className="ops-notes">
                      {o.onrampSessionId ? (
                        <div>
                          <code className="break">{o.onrampSessionId}</code>
                        </div>
                      ) : null}
                      {o.notes ? <span>{o.notes}</span> : null}
                    </td>
                    <td>
                      {o.status === "sent_to_client" ? (
                        <code className="break">{o.outboundTxHash}</code>
                      ) : o.status === "awaiting_payment" ? (
                        <span className="fineprint">Waiting for Onramp</span>
                      ) : (
                        <MarkSentForm orderId={o.id} opsKey={expected} />
                      )}
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
