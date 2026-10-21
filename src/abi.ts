export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export function decodeUint(hex: string): number {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!raw || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error('empty integer');
  }
  const value = Number(BigInt(`0x${raw}`));
  if (!Number.isFinite(value)) throw new Error('integer overflow');
  return value;
}

function stripNull(value: string): string {
  return value.replace(/\0/g, '').trim();
}

export function decodeAbiString(hex: string): string {
  const raw = (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase();
  if (!raw || !/^[0-9a-f]+$/.test(raw)) throw new Error('empty string');
  if (raw.length === 64) {
    return stripNull(Buffer.from(raw, 'hex').toString('utf8'));
  }
  if (raw.length < 128) throw new Error('short string');
  const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
  if (!Number.isInteger(length) || length < 0 || length > 256) {
    throw new Error('bad string length');
  }
  const data = raw.slice(128, 128 + length * 2);
  if (data.length !== length * 2) throw new Error('truncated string');
  return stripNull(Buffer.from(data, 'hex').toString('utf8'));
}

function logIndexOf(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const parsed = value.startsWith('0x') ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
  return parsed;
}

export function topicAddress(topic: string): string {
  const hex = topic.toLowerCase().replace(/^0x/, '');
  if (hex.length < 40) throw new Error('short topic');
  return `0x${hex.slice(-40)}`;
}

export type TransferLog = {
  logIndex: number;
  from: string;
  to: string;
  amount: bigint;
};

type ReceiptLog = {
  address?: string;
  topics?: string[];
  data?: string;
  logIndex?: string | number;
};

export function decodeTransfers(receipt: { logs?: ReceiptLog[] }, tokenAddress: string): TransferLog[] {
  const wanted = tokenAddress.toLowerCase();
  const logs = receipt.logs ?? [];
  const transfers: TransferLog[] = [];
  for (const log of logs) {
    if ((log.address ?? '').toLowerCase() !== wanted) continue;
    const topics = log.topics ?? [];
    if ((topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topics.length < 3 || !log.data) continue;
    const logIndex = logIndexOf(log.logIndex);
    if (!Number.isInteger(logIndex)) continue;
    transfers.push({
      logIndex,
      from: topicAddress(topics[1] ?? ''),
      to: topicAddress(topics[2] ?? ''),
      amount: BigInt(log.data),
    });
  }
  return transfers;
}

export function receiptSucceeded(status: unknown): boolean {
  if (status === 1 || status === '0x1' || status === '1') return true;
  return false;
}
