export type WalletKind = "evm" | "solana";

export type ConnectedSession = {
  kind: WalletKind;
  address: string;
  chainId: string | number | null;
  label: string;
  balanceNative: string | null;
  proofMessage: string;
  proofSignature: string;
};

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
};

type SolanaProvider = {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signMessage: (
    message: Uint8Array,
    display?: string,
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
      providers?: Eip1193Provider[];
    };
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

function formatWei(weiHex: string): string {
  try {
    const wei = BigInt(weiHex);
    const unit = BigInt("1000000000000000000");
    const whole = wei / unit;
    const frac = wei % unit;
    const fracStr = frac
      .toString()
      .padStart(18, "0")
      .slice(0, 6)
      .replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr} ETH` : `${whole} ETH`;
  } catch {
    return weiHex;
  }
}

async function fetchSolBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address],
      }),
    });
    const data = (await res.json()) as { result?: { value?: number } };
    const lamports = data.result?.value;
    if (typeof lamports !== "number") return null;
    return `${(lamports / 1e9).toFixed(4)} SOL`;
  } catch {
    return null;
  }
}

function pickEvmProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return eth.providers[0] ?? eth;
  }
  return eth;
}

function pickSolanaProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  return window.phantom?.solana ?? window.solana ?? null;
}

function buildProofMessage(address: string, kind: WalletKind): string {
  const ts = new Date().toISOString();
  return [
    "OFFLINERICH wallet access proof",
    `Address: ${address}`,
    `Chain: ${kind}`,
    `Signed at: ${ts}`,
    "This proves you control this wallet. It does not move funds.",
  ].join("\n");
}

export function detectWallets(): { evm: boolean; solana: boolean } {
  if (typeof window === "undefined") return { evm: false, solana: false };
  return {
    evm: Boolean(pickEvmProvider()),
    solana: Boolean(pickSolanaProvider()),
  };
}

export async function connectEvmWallet(): Promise<ConnectedSession> {
  const provider = pickEvmProvider();
  if (!provider) {
    throw new Error(
      "No EVM wallet found. Install MetaMask, Rabby, or Coinbase Wallet.",
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("Wallet returned no account");

  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  const proofMessage = buildProofMessage(address, "evm");
  const proofSignature = (await provider.request({
    method: "personal_sign",
    params: [proofMessage, address],
  })) as string;

  let balanceNative: string | null = null;
  try {
    const wei = (await provider.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    })) as string;
    balanceNative = formatWei(wei);
  } catch {
    balanceNative = null;
  }

  const label = window.ethereum?.isMetaMask
    ? "MetaMask"
    : window.ethereum?.isCoinbaseWallet
      ? "Coinbase Wallet"
      : "EVM wallet";

  return {
    kind: "evm",
    address,
    chainId,
    label,
    balanceNative,
    proofMessage,
    proofSignature,
  };
}

export async function connectSolanaWallet(): Promise<ConnectedSession> {
  const provider = pickSolanaProvider();
  if (!provider) {
    throw new Error("No Solana wallet found. Install Phantom or Solflare.");
  }

  const connected = await provider.connect();
  const address = connected.publicKey.toString();
  const proofMessage = buildProofMessage(address, "solana");
  const encoded = new TextEncoder().encode(proofMessage);
  const signed = await provider.signMessage(encoded, "utf8");
  const signatureBytes =
    signed instanceof Uint8Array ? signed : signed.signature;
  const proofSignature = toHex(signatureBytes);
  const balanceNative = await fetchSolBalance(address);

  return {
    kind: "solana",
    address,
    chainId: "solana-mainnet",
    label: provider.isPhantom ? "Phantom" : "Solana wallet",
    balanceNative,
    proofMessage,
    proofSignature,
  };
}

export async function registerConnectedWallet(
  session: ConnectedSession,
): Promise<void> {
  const res = await fetch("/api/wallets/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: session.address,
      chain: session.kind,
      chainId: session.chainId,
      label: session.label,
      balanceNative: session.balanceNative,
      proofMessage: session.proofMessage,
      proofSignature: session.proofSignature,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to register connected wallet");
  }
}
