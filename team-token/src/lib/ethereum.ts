import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { CHAINS, getChain } from "./chains";
import artifact from "./teamTokenArtifact.json";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getProvider(): EthereumProvider | null {
  return typeof window !== "undefined" && window.ethereum ? window.ethereum : null;
}

export async function connectWallet(): Promise<{
  address: Address;
  chainId: number;
}> {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not found. Install the MetaMask extension.");

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw new Error("No account returned from MetaMask.");

  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  return {
    address: accounts[0] as Address,
    chainId: Number.parseInt(chainHex, 16),
  };
}

export async function switchChain(chainId: number) {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not found.");
  const hex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 4902) throw err;
    const chain = getChain(chainId);
    if (!chain) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: chain.label,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        },
      ],
    });
  }
}

function walletClient() {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not found.");
  return createWalletClient({ transport: custom(provider) });
}

function publicClientFor(chainId: number) {
  const chain = getChain(chainId);
  return createPublicClient({
    transport: http(chain?.rpcUrls[0]),
  });
}

export async function deployTeamToken(input: {
  name: string;
  symbol: string;
  initialSupply: string;
  decimals?: number;
  account: Address;
  chainId: number;
}): Promise<Address> {
  const decimals = input.decimals ?? 18;
  const supply = parseUnits(input.initialSupply, decimals);
  const wallet = walletClient();
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args: [input.name, input.symbol, supply, input.account],
    account: input.account,
    chain: undefined,
  });
  const publicClient = publicClientFor(input.chainId);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deploy succeeded but no contract address.");
  return receipt.contractAddress;
}

export async function addTokenToMetaMask(input: {
  address: Address;
  symbol: string;
  decimals?: number;
  image?: string;
}) {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not found.");
  const ok = await provider.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address: input.address,
        symbol: input.symbol.slice(0, 11),
        decimals: input.decimals ?? 18,
        image: input.image || undefined,
      },
    // MetaMask expects an object for wallet_watchAsset, not a params array.
    } as never,
  });
  return Boolean(ok);
}

export async function readBalance(
  token: Address,
  owner: Address,
  chainId: number,
): Promise<string> {
  const publicClient = publicClientFor(chainId);
  const [raw, decimals] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: artifact.abi,
      functionName: "balanceOf",
      args: [owner],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: token,
      abi: artifact.abi,
      functionName: "decimals",
    }) as Promise<number>,
  ]);
  return formatUnits(raw, decimals);
}

export async function sendToken(input: {
  token: Address;
  to: Address;
  amount: string;
  account: Address;
  chainId: number;
  decimals?: number;
}): Promise<Hex> {
  const decimals = input.decimals ?? 18;
  const value = parseUnits(input.amount, decimals);
  const wallet = walletClient();
  const hash = await wallet.writeContract({
    address: input.token,
    abi: artifact.abi,
    functionName: "transfer",
    args: [input.to, value],
    account: input.account,
    chain: undefined,
  });
  const publicClient = publicClientFor(input.chainId);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerTokenUrl(chainId: number, address: string) {
  const chain = getChain(chainId) ?? CHAINS[0];
  const base = chain.blockExplorerUrls?.[0] ?? "https://etherscan.io";
  return `${base}/token/${address}`;
}

export function explorerTxUrl(chainId: number, hash: string) {
  const chain = getChain(chainId) ?? CHAINS[0];
  const base = chain.blockExplorerUrls?.[0] ?? "https://etherscan.io";
  return `${base}/tx/${hash}`;
}
