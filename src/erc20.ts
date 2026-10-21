import { decodeAbiString, decodeUint } from './abi.ts';
import { HttpError } from './errors.ts';

export type RpcClient = {
  call(chainId: number, method: string, params: unknown[]): Promise<unknown>;
};

const SYMBOL = '0x95d89b41';
const DECIMALS = '0x313ce567';
const NAME = '0x06fdde03';

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
