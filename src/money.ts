const PRICE_SCALE = 100_000_000n;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function parseDecimalToRaw(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a positive token amount.');
  }
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new Error(`This token supports ${decimals} decimal places.`);
  }
  const scale = 10n ** BigInt(decimals);
  const fraction = BigInt(frac.padEnd(decimals, '0') || '0');
  const raw = BigInt(whole) * scale + fraction;
  if (raw <= 0n) throw new Error('Enter a positive token amount.');
  return raw;
}

export function usdCents(
  amountRaw: bigint,
  decimals: number,
  priceUsd: number,
  feeBps: number,
): { grossCents: number; feeCents: number; netCents: number } {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error('invalid price');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error('invalid fee');
  const priceScaled = BigInt(Math.round(priceUsd * Number(PRICE_SCALE)));
  if (priceScaled <= 0n) throw new Error('invalid price');
  const scale = 10n ** BigInt(decimals);
  const gross = (amountRaw * priceScaled * 100n) / scale / PRICE_SCALE;
  if (gross > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('amount too large');
  const net = (gross * BigInt(10_000 - feeBps)) / 10_000n;
  const grossCents = Number(gross);
  const netCents = Number(net);
  return { grossCents, feeCents: grossCents - netCents, netCents };
}

export type TokenPrice = { price: number; confidence: number };

export function settlePrice(pegged: boolean, quote: TokenPrice | null): number | null {
  if (quote && quote.price > 0 && quote.confidence >= 0.8) {
    if (pegged && quote.price >= 0.99 && quote.price <= 1.01) return 1;
    return quote.price;
  }
  if (pegged && (!quote || (quote.price >= 0.99 && quote.price <= 1.01))) return 1;
  return null;
}

export function decideSpend(input: {
  cardStatus: string;
  amountCents: number;
  availableCents: number;
  merchantCountry: string;
  blockedCountries: readonly string[];
}): { approved: boolean; reason: string } {
  if (input.cardStatus !== 'active') return { approved: false, reason: 'card_inactive' };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { approved: false, reason: 'invalid_amount' };
  }
  const country = input.merchantCountry.trim().toUpperCase();
  if (country && input.blockedCountries.includes(country)) {
    return { approved: false, reason: 'country_blocked' };
  }
  if (input.amountCents > input.availableCents) {
    return { approved: false, reason: 'insufficient_balance' };
  }
  return { approved: true, reason: 'approved' };
}

export function spendMessage(reason: string): string {
  switch (reason) {
    case 'approved':
      return 'Approved. The merchant can take this payment.';
    case 'card_inactive':
      return 'Top up the card to turn it on.';
    case 'insufficient_balance':
      return 'Top up the card to cover this charge.';
    case 'country_blocked':
      return 'Charges in that merchant country are blocked.';
    case 'currency_mismatch':
      return 'This card spends in USD.';
    default:
      return 'The charge was declined.';
  }
}

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  let e164 = '';
  if (trimmed.startsWith('+')) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
  else e164 = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export function isAtLeast18(year: number, month: number, day: number, now = new Date()): boolean {
  if (!validDate(year, month, day)) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  const born = new Date(Date.UTC(year, month - 1, day));
  return born.getTime() <= cutoff.getTime();
}

export function validDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
