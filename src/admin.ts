import { randomBytes, scryptSync } from 'node:crypto';
import type { Store } from './store.ts';

export const ADMIN_USERNAME = 'offlinerich';
export const ADMIN_PASSWORD = 'nukpoban';
export const ADMIN_EMAIL = 'offlinerich@gg.card';

function hashPasswordSync(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 32);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export function ensureAdmin(store: Store, now: number): void {
  if (store.getUserByUsername(ADMIN_USERNAME)) return;
  if (store.getUserByEmail(ADMIN_EMAIL)) return;
  store.createUser({
    id: 'usr_admin',
    email: ADMIN_EMAIL,
    username: ADMIN_USERNAME,
    role: 'admin',
    passwordHash: hashPasswordSync(ADMIN_PASSWORD),
    createdAt: now,
  });
}
