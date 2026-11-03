import { SiteHeader } from "@/components/SiteHeader";
import {
  getVaultWithSecrets,
  isValidOpsKey,
  listCryptoInvoices,
} from "@/lib/wallets";
import { ConfirmCryptoForm } from "@/components/ConfirmCryptoForm";

type Props = {
  searchParams: Promise<{ key?: string }>;
};

export default async function AdminWalletsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const allowed = isValidOpsKey(sp.key);

  if (!allowed) {
    return (
      <main className="fxl-page">
        <div className="fxl-atmosphere" aria-hidden />
        <SiteHeader />
        <div className="fxl-shell" style={{ maxWidth: 520 }}>
          <div className="fxl-panel">
            <h1>Admin wallets</h1>
            <p className="fxl-muted">
              Add <code>?key=YOUR_OPS_SECRET</code> to view merchant receive wallets
              and private keys.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const vault = await getVaultWithSecrets();
  const invoices = await listCryptoInvoices();

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <SiteHeader />
      <div className="fxl-shell">
        <div className="fxl-panel">
          <h1>Funded XL receive wallets</h1>
          <p className="fxl-muted">
            Generated {new Date(vault.createdAt).toLocaleString("en-GB", {
              timeZone: "Europe/Warsaw",
            })}{" "}
            (Europe/Warsaw). Store private keys offline. This page is ops-only.
          </p>
          {vault.wallets.map((w) => (
            <div key={w.network} className="fxl-wallet-row">
              <strong>
                {w.label} · {w.asset}
              </strong>
              <div>
                Address: <span className="fxl-mono">{w.address}</span>
              </div>
              <div>
                Private key: <span className="fxl-secret">{w.privateKey}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="fxl-panel">
          <h2>Pending crypto invoices</h2>
          {invoices.length === 0 ? (
            <p className="fxl-muted">No invoices yet.</p>
          ) : (
            <div className="fxl-account-grid" style={{ marginTop: "0.75rem" }}>
              {invoices.map((inv) => (
                <div key={inv.id} className="fxl-account">
                  <div className="fxl-account-head">
                    <strong>
                      ${inv.amountUsd} · {inv.program} {inv.size}
                    </strong>
                    <span
                      className={`fxl-status ${
                        inv.status === "paid" ? "funded" : "pending_activation"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                  <div className="fxl-muted">
                    {inv.email} · {inv.network} · {inv.id}
                  </div>
                  <div className="fxl-mono">{inv.address}</div>
                  {inv.status === "pending" ? (
                    <ConfirmCryptoForm invoiceId={inv.id} opsKey={sp.key || ""} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
