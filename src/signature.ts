import { verifyMessage, type Address, type Hex } from 'viem';

export function linkMessage(input: { address: string; userId: string; nonce: string }): string {
  return [
    'OfflineRich card',
    'Link this wallet to fund your card.',
    `Address: ${input.address.toLowerCase()}`,
    `Account: ${input.userId}`,
    `Nonce: ${input.nonce}`,
  ].join('\n');
}

export async function signatureMatches(address: string, message: string, signature: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length < 132) return false;
  try {
    return await verifyMessage({
      address: address as Address,
      message,
      signature: signature as Hex,
    });
  } catch {
    return false;
  }
}
