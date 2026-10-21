import { decodeAbiString, decodeUint } from './abi.ts';
import { HttpError } from './errors.ts';

export type RpcClient = {
  call(chainId: number, method: string, params: unknown[]): Promise<unknown>;
};

const SYMBOL = '0x95d89b41';
const DECIMALS = '0x313ce567';
const NAME = '0x06fdde03';
const BALANCE_OF = '0x70a08231';

export function balanceOfData(holder: string): string {
  return `${BALANCE_OF}${holder.trim().slice(2).toLowerCase().padStart(64, '0')}`;
}

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw <= 0n) return '0';
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export async function readBalance(rpc: RpcClient, chainId: number, token: string, holder: string): Promise<bigint> {
  const hex = await rpc.call(chainId, 'eth_call', [{ to: token, data: balanceOfData(holder) }, 'latest']);
  if (typeof hex !== 'string' || hex === '0x') return 0n;
  return BigInt(hex);
}

export async function readErc20(
  rpc: RpcClient,
  chainId: number,
  address: string,
): Promise<{ name: string; symbol: string; decimals: number }> {
  let symbolHex: unknown;
  let decimalsHex: unknown;
  try {
    [symbolHex, decimalsHex] = await Promise.all([
      rpc.call(chainId, 'eth_call', [{ to: address, data: SYMBOL }, 'latest']),
      rpc.call(chainId, 'eth_call', [{ to: address, data: DECIMALS }, 'latest']),
    ]);
  } catch {
    throw new HttpError(502, 'chain_unavailable', 'Could not reach that chain to read the contract.');
  }
  if (typeof symbolHex !== 'string' || typeof decimalsHex !== 'string') {
    throw new HttpError(400, 'not_a_token', 'That address did not respond like an ERC-20 contract.');
  }
  let symbol: string;
  let decimals: number;
  try {
    symbol = decodeAbiString(symbolHex).trim();
    decimals = decodeUint(decimalsHex);
  } catch {
    throw new HttpError(400, 'not_a_token', 'That address did not respond like an ERC-20 contract.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._$+-]{0,15}$/.test(symbol) || decimals < 0 || decimals > 36) {
    throw new HttpError(400, 'not_a_token', 'That address did not respond like an ERC-20 contract.');
  }
  let name = symbol;
  try {
    const nameHex = await rpc.call(chainId, 'eth_call', [{ to: address, data: NAME }, 'latest']);
    if (typeof nameHex === 'string') {
      const decoded = decodeAbiString(nameHex).trim();
      if (decoded) name = decoded.slice(0, 64);
    }
  } catch {
    name = symbol;
  }
  return { name, symbol, decimals };
}
