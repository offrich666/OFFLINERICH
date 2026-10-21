import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode') as {
  toString: (text: string, options: { type: 'svg'; margin: number; errorCorrectionLevel: 'M' }) => Promise<string>;
};

export async function qrSvg(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return svg.replace(/<\?xml[^>]*>/, '').trim();
}
