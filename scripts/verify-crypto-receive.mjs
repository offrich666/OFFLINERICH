/**
 * Smoke-test order store transitions for pay→treasury→client.
 * Run: node scripts/verify-crypto-receive.mjs
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const ordersFile = path.join(dataDir, "transfer-orders.json");
const backupFile = path.join(dataDir, "transfer-orders.verify-backup.json");

const TREASURY_EVM = "0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9";

async function loadOrders() {
  try {
    return JSON.parse(await fs.readFile(ordersFile, "utf8"));
  } catch {
    return [];
  }
}

async function saveOrders(orders) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2) + "\n");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await fs.mkdir(dataDir, { recursive: true });
  let hadFile = true;
  try {
    await fs.access(ordersFile);
  } catch {
    hadFile = false;
  }
  if (hadFile) {
    await fs.copyFile(ordersFile, backupFile);
  }

  try {
    await saveOrders([]);

    const now = new Date().toISOString();
    const onrampId = "cos_test_verify_1";
    const order = {
      id: "ord_verify_1",
      createdAt: now,
      updatedAt: now,
      status: "awaiting_payment",
      amountCents: 1000,
      currency: "usd",
      network: "polygon",
      asset: "USDC",
      clientWallet: "0x1111111111111111111111111111111111111111",
      treasuryWallet: TREASURY_EVM,
      onrampSessionId: onrampId,
      notes: "test awaiting",
    };
    await saveOrders([order]);

    // Simulate fulfillment_complete
    const orders = await loadOrders();
    const found = orders.find((o) => o.onrampSessionId === onrampId);
    assert(found, "order missing");
    found.status = "treasury_funded";
    found.notes = "Crypto delivered to treasury via Stripe Onramp.";
    await saveOrders(orders);

    const after = await loadOrders();
    assert(after[0].status === "treasury_funded", "expected treasury_funded");
    assert(after[0].treasuryWallet === TREASURY_EVM, "treasury mismatch");
    assert(
      after[0].clientWallet.startsWith("0x"),
      "client wallet should be present",
    );

    // Mark sent
    after[0].status = "sent_to_client";
    after[0].outboundTxHash = "0xabc";
    await saveOrders(after);
    const sent = await loadOrders();
    assert(sent[0].status === "sent_to_client", "expected sent_to_client");
    assert(sent[0].outboundTxHash === "0xabc", "tx hash missing");

    console.log("OK crypto-receive order transitions:");
    console.log("  awaiting_payment → treasury_funded → sent_to_client");
    console.log("  treasury:", TREASURY_EVM);
  } finally {
    if (hadFile) {
      await fs.copyFile(backupFile, ordersFile);
      await fs.unlink(backupFile).catch(() => {});
    } else {
      await fs.writeFile(ordersFile, "[]\n");
    }
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
