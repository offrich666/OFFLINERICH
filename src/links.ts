import os from 'node:os';

export function accessLinks(port: number): string[] {
  const links = new Set<string>([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = String(entry.family);
      if (entry.internal || (family !== 'IPv4' && family !== '4')) continue;
      links.add(`http://${entry.address}:${port}`);
    }
  }
  return [...links];
}
