export type R2DirectUploadConfig = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function parseR2DirectUploadConfig(values: {
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}): R2DirectUploadConfig | null {
  const accountId = values.R2_ACCOUNT_ID?.trim();
  const bucket = values.R2_BUCKET_NAME?.trim();
  const accessKeyId = values.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = values.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId && !bucket && !accessKeyId && !secretAccessKey) return null;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error('Direct audio storage is not fully configured.');
  if (!/^[a-f0-9]{32}$/i.test(accountId))
    throw new Error('The R2 account identifier is invalid.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error('The R2 bucket name is invalid.');
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

export async function presignR2UploadPart(
  config: R2DirectUploadConfig,
  input: {
    key: string;
    uploadId: string;
    partNumber: number;
    contentType: string;
    expiresSeconds?: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = dateTime.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${encodeSegment(config.bucket)}/${input.key
    .split('/')
    .map(encodeSegment)
    .join('/')}`;
  const query = new Map<string, string>([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', dateTime],
    [
      'X-Amz-Expires',
      String(Math.min(900, Math.max(60, input.expiresSeconds ?? 600))),
    ],
    ['X-Amz-SignedHeaders', 'content-type;host'],
    ['partNumber', String(input.partNumber)],
    ['uploadId', input.uploadId],
  ]);
  const canonicalQuery = [...query]
    .map(([key, value]) => [encodeSegment(key), encodeSegment(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const canonicalRequest = [
    'PUT',
    path,
    canonicalQuery,
    `content-type:${input.contentType.trim().toLowerCase()}\nhost:${host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateTime,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = await hmac(`AWS4${config.secretAccessKey}`, date);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  const signature = bytesToHex(await hmac(signingKey, stringToSign));
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function encodeSegment(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function sha256Hex(value: string) {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  );
}

async function hmac(key: string | Uint8Array, value: string) {
  const raw = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(raw).buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(value),
    ),
  );
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
