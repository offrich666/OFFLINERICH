import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import { HttpError } from './errors.ts';

export function visaXPayToken(input: {
  sharedSecret: string;
  resourcePath: string;
  query: string;
  body: string;
  timestamp: number;
}): string {
  const timestamp = String(input.timestamp);
  const prehash = `${timestamp}${input.resourcePath}${input.query}${input.body}`;
  const hash = createHmac('sha256', input.sharedSecret).update(prehash).digest('hex');
  return `xv2:${timestamp}:${hash}`;
}

export type VisaSamsungResult = {
  opaquePaymentCard: string;
  last4?: string;
  vCardID?: string;
};

export async function requestSamsungCardData(input: {
  apiKey: string;
  sharedSecret: string;
  apiBase: string;
  certPath: string;
  keyPath: string;
  vCardId: string;
  deviceId: string;
  clientCustomerId: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<VisaSamsungResult> {
  const resourcePath = 'provisioning/cardData/samsungPay';
  const query = `apikey=${encodeURIComponent(input.apiKey)}`;
  const body = JSON.stringify({
    vCardID: input.vCardId,
    deviceID: input.deviceId,
    clientCustomerID: input.clientCustomerId,
    tokenServiceProvider: 'V',
  });
  const token = visaXPayToken({
    sharedSecret: input.sharedSecret,
    resourcePath,
    query,
    body,
    timestamp: Math.floor((input.now ?? Date.now)() / 1000),
  });
  const path = `/inapp/${resourcePath}?${query}`;
  const url = `${input.apiBase}${path}`;
  const response = await visaRequest({
    url,
    path,
    apiBase: input.apiBase,
    body,
    token,
    certPath: input.certPath,
    keyPath: input.keyPath,
    fetchImpl: input.fetchImpl,
  });
  const text = await response.text();
  let json: { opaquePaymentCard?: string; last4?: string; vCardID?: string; errorResponse?: { message?: string } } =
    {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    json = {};
  }
  if (!response.ok || !json.opaquePaymentCard) {
    const message = json.errorResponse?.message || 'Visa did not return a Samsung Pay payload.';
    throw new HttpError(502, 'visa_error', message);
  }
  return { opaquePaymentCard: json.opaquePaymentCard, last4: json.last4, vCardID: json.vCardID };
}

async function visaRequest(input: {
  url: string;
  path: string;
  apiBase: string;
  body: string;
  token: string;
  certPath: string;
  keyPath: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  if (input.certPath || input.keyPath) {
    if (!input.certPath || !input.keyPath) {
      throw new HttpError(500, 'visa_cert', 'Set both VISA_CERT_PATH and VISA_KEY_PATH.');
    }
    const hostname = new URL(input.apiBase).hostname;
    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          method: 'POST',
          hostname,
          path: input.path,
          cert: fs.readFileSync(input.certPath),
          key: fs.readFileSync(input.keyPath),
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(input.body),
            'x-pay-token': input.token,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 500 }));
          });
        },
      );
      request.on('error', reject);
      request.setTimeout(15000, () => request.destroy(new Error('Visa request timed out')));
      request.write(input.body);
      request.end();
    });
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  return fetchImpl(input.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pay-token': input.token,
    },
    body: input.body,
    signal: AbortSignal.timeout(15000),
  });
}
