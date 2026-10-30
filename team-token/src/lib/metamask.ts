import {
  createEVMClient,
  type MetamaskConnectEVM,
  type EIP1193Provider,
} from "@metamask/connect-evm";
import { CHAINS, DEFAULT_CHAIN_ID } from "./chains";

export type EthereumProvider = EIP1193Provider;

let clientPromise: Promise<MetamaskConnectEVM> | null = null;

function toHexChainId(id: number): `0x${string}` {
  return `0x${id.toString(16)}`;
}

/** Live RPC map for MetaMask Connect (hex chain id → URL). */
export function getSupportedNetworks(): Record<`0x${string}`, string> {
  const map: Record<`0x${string}`, string> = {};
  for (const c of CHAINS) {
    map[toHexChainId(c.id)] = c.rpcUrls[0];
  }
  return map;
}

export function liveChainIdsHex(): `0x${string}`[] {
  // First entry becomes the preferred active chain on connect.
  const ordered = [
    DEFAULT_CHAIN_ID,
    ...CHAINS.map((c) => c.id).filter((id) => id !== DEFAULT_CHAIN_ID),
  ];
  return ordered.map(toHexChainId);
}

/**
 * Official MetaMask Connect EVM client
 * (@metamask/connect-evm from https://github.com/orgs/MetaMask/repositories).
 */
export async function getEvmClient(): Promise<MetamaskConnectEVM> {
  if (!clientPromise) {
    clientPromise = createEVMClient({
      dapp: {
        name: "RelayMark",
        url: typeof window !== "undefined" ? window.location.origin : "http://localhost",
      },
      api: {
        supportedNetworks: getSupportedNetworks(),
      },
      analytics: { enabled: false },
      ui: {
        preferExtension: true,
        showInstallModal: true,
      },
    });
  }
  return clientPromise;
}

export async function resolveMetaMaskProvider(force = false): Promise<EIP1193Provider> {
  const client = await getEvmClient();
  if (force) {
    // Ensure EIP-6963 / install UX has a chance to run.
    await client.announceProvider().catch(() => undefined);
  }
  return client.getProvider();
}

export function getMetaMaskProvider(): EIP1193Provider | null {
  // Sync access only after client init; callers should prefer resolveMetaMaskProvider.
  return null;
}

export async function connectWithMetaMask(): Promise<{
  address: `0x${string}`;
  chainId: number;
  provider: EIP1193Provider;
  client: MetamaskConnectEVM;
}> {
  const client = await getEvmClient();
  try {
    const { accounts, chainId } = await client.connect({
      chainIds: liveChainIdsHex(),
      forceRequest: true,
    });
    if (!accounts[0]) {
      throw new Error("No account returned from MetaMask.");
    }
    return {
      address: accounts[0],
      chainId: Number.parseInt(chainId, 16),
      provider: client.getProvider(),
      client,
    };
  } catch (err) {
    throw new Error(formatWalletError(err));
  }
}

export async function switchMetaMaskChain(chainId: number) {
  const client = await getEvmClient();
  const chain = CHAINS.find((c) => c.id === chainId);
  const hex = toHexChainId(chainId);
  try {
    await client.switchChain({
      chainId: hex,
      chainConfiguration: chain
        ? {
            chainId: hex,
            chainName: chain.label,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: chain.blockExplorerUrls,
          }
        : undefined,
    });
  } catch (err) {
    throw new Error(formatWalletError(err));
  }
}

export async function probeMetaMask(): Promise<{
  available: boolean;
  detail: string;
}> {
  try {
    const client = await getEvmClient();
    await client.announceProvider().catch(() => undefined);
    return {
      available: true,
      detail: "MetaMask Connect ready — click Connect MetaMask",
    };
  } catch (e) {
    return {
      available: false,
      detail: e instanceof Error ? e.message : "MetaMask Connect failed to start",
    };
  }
}

export function formatWalletError(err: unknown): string {
  if (!err || typeof err !== "object") return "Wallet request failed";
  const e = err as { code?: number | string; message?: string; shortMessage?: string };
  if (e.code === 4001 || e.code === "ACTION_REJECTED") {
    return "Request rejected in MetaMask. Open MetaMask and approve to continue.";
  }
  if (e.code === -32002) {
    return "MetaMask already has a pending request. Open the MetaMask popup and finish it.";
  }
  return e.shortMessage || e.message || "Wallet request failed";
}

export const METAMASK_INSTALL_URL = "https://metamask.io/download/";
