import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { createWalletClient, http, isAddress, parseUnits } from 'viem';
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains';

const chains = {
  1: mainnet,
  8453: base,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  56: bsc,
} as const;

const transferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

let account: PrivateKeyAccount | null = null;

function normalizeKey(value: string): `0x${string}` {
  const trimmed = value.trim();
  const hex = (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Enter the private key as 64 hex characters. It stays in this browser and is not sent to the server.');
  }
  return hex;
}

const ggWallet = {
  connect(privateKey: string): string {
    account = privateKeyToAccount(normalizeKey(privateKey));
    return account.address;
  },
  address(): string {
    return account?.address ?? '';
  },
  async sign(message: string): Promise<string> {
    if (!account) throw new Error('Paste the private key first.');
    return account.signMessage({ message });
  },
  async sendToken(input: { chainId: number; token: string; to: string; amount: string; decimals: number }): Promise<string> {
    if (!account) throw new Error('Paste the private key first.');
    const chain = chains[input.chainId as keyof typeof chains];
    if (!chain) throw new Error('That chain is not available from this page.');
    if (!isAddress(input.token) || !isAddress(input.to)) throw new Error('The token or deposit address is not valid.');
    const client = createWalletClient({ account, chain, transport: http() });
    return client.writeContract({
      address: input.token,
      abi: transferAbi,
      functionName: 'transfer',
      args: [input.to, parseUnits(input.amount, input.decimals)],
    });
  },
};

Object.assign(globalThis, { ggWallet });
