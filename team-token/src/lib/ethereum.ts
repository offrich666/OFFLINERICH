import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { CHAINS, getChain, getViemChain } from "./chains";
import artifact from "./teamTokenArtifact.json";
import {
  connectWithMetaMask,
  formatWalletError,
  getEvmClient,
  resolveMetaMaskProvider,
  switchMetaMaskChain,
  type EthereumProvider,
} from "./metamask";

export {
  formatWalletError,
  getEvmClient,
  probeMetaMask,
  resolveMetaMaskProvider,
  METAMASK_INSTALL_URL,
} from "./metamask";

/** @deprecated prefer resolveMetaMaskProvider */
export async function getProvider(): Promise<EthereumProvider> {
  return resolveMetaMaskProvider();
}

function publicClientFor(chainId: number) {
  const chain = getViemChain(chainId);
  const option = getChain(chainId);
  return createPublicClient({
    chain,
    transport: http(option?.rpcUrls[0] ?? chain.rpcUrls.default.http[0]),
  });
}

async function wallet(): Promise<{
  client: WalletClient;
  account: Address;
  provider: EthereumProvider;
}> {
  const mm = await resolveMetaMaskProvider();
  const accounts = (await mm.request({ method: "eth_accounts", params: [] })) as string[];
  const account = accounts[0] as Address | undefined;
  if (!account) {
    throw new Error("MetaMask has no connected account. Click Connect MetaMask first.");
  }
  const client = createWalletClient({
    account,
    transport: custom(mm),
  });
  return { client, account, provider: mm };
}

export async function connectWallet(): Promise<{
  address: Address;
  chainId: number;
  provider: EthereumProvider;
}> {
  const { address, chainId, provider } = await connectWithMetaMask();
  return { address, chainId, provider };
}

export async function switchChain(chainId: number) {
  await switchMetaMaskChain(chainId);
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
  const chain = getViemChain(input.chainId);
  const { client, account } = await wallet();
  if (account.toLowerCase() !== input.account.toLowerCase()) {
    throw new Error("Connected MetaMask account changed. Connect again.");
  }

  // Ensure wallet is on the selected live chain before deploy.
  await switchMetaMaskChain(input.chainId);

  let hash: Hex;
  try {
    hash = await client.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode as Hex,
      args: [input.name, input.symbol, supply, input.account],
      account,
      chain,
    });
  } catch (err) {
    throw new Error(formatWalletError(err));
  }

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
  const mm = await resolveMetaMaskProvider();
  try {
    const ok = await mm.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: input.address,
          symbol: input.symbol.slice(0, 11),
          decimals: input.decimals ?? 18,
          image: input.image || undefined,
        },
      } as never,
    });
    return Boolean(ok);
  } catch (err) {
    throw new Error(formatWalletError(err));
  }
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
  const chain = getViemChain(input.chainId);
  const { client, account } = await wallet();
  if (account.toLowerCase() !== input.account.toLowerCase()) {
    throw new Error("Connected MetaMask account changed. Connect again.");
  }

  await switchMetaMaskChain(input.chainId);

  let hash: Hex;
  try {
    hash = await client.writeContract({
      address: input.token,
      abi: artifact.abi,
      functionName: "transfer",
      args: [input.to, value],
      account,
      chain,
    });
  } catch (err) {
    throw new Error(formatWalletError(err));
  }

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

export async function subscribeWalletEvents(handlers: {
  onAccounts: (accounts: string[]) => void;
  onChain: (chainId: number) => void;
}) {
  const client = await getEvmClient();
  const provider = client.getProvider();

  const onAccounts = (accounts: unknown) => {
    handlers.onAccounts((accounts as string[]) ?? []);
  };
  const onChain = (hex: unknown) => {
    handlers.onChain(Number.parseInt(String(hex), 16));
  };

  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);

  return () => {
    provider.off("accountsChanged", onAccounts);
    provider.off("chainChanged", onChain);
  };
}
