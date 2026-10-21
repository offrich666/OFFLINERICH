import { randomBytes } from 'node:crypto';

export function id(prefix: string): string {
  return `${prefix}${randomBytes(12).toString('hex')}`;
}

export function secretToken(): string {
  return randomBytes(32).toString('hex');
}
