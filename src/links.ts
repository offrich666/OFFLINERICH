import os from 'node:os';

function normalizePublicUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/$/, '');
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function accessLinks(port: number, publicBaseUrl?: string): string[] {
  const links = new Set<string>();
  const publicUrl = normalizePublicUrl(publicBaseUrl);
  if (publicUrl) links.add(publicUrl);
  links.add(`http://127.0.0.1:${port}`);
  links.add(`http://localhost:${port}`);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = String(entry.family);
      if (entry.internal || (family !== 'IPv4' && family !== '4')) continue;
      links.add(`http://${entry.address}:${port}`);
    }
  }
  return [...links];
}

/** Prefer a phone-reachable HTTPS/public URL — never loopback (fails on iPhone). */
export function phoneAccessUrl(port: number, publicBaseUrl?: string, requestOrigin?: string): string | null {
  const publicUrl = normalizePublicUrl(publicBaseUrl);
  if (publicUrl) return publicUrl;

  const fromRequest = normalizePublicUrl(requestOrigin);
  if (fromRequest && !isLoopbackHost(fromRequest)) return fromRequest;

  for (const link of accessLinks(port)) {
    if (!isLoopbackHost(link)) return link;
  }
  return null;
}

function isLoopbackHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.endsWith('.local');
  } catch {
    return true;
  }
}
