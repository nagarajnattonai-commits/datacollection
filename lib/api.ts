import { WorkflowError } from './workflow.ts';

type Bucket = { startedAt: number; count: number };
const buckets = new Map<string, Bucket>();

export function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[A-Za-z0-9_-]{1,64}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
) {
  const client = request.headers.get('cf-connecting-ip') ?? 'local';
  const key = `${scope}:${client}`;
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets)
      if (now - value.startedAt >= windowMs) buckets.delete(bucketKey);
    if (buckets.size > 10_000)
      buckets.delete(buckets.keys().next().value as string);
  }
  if (bucket.count > limit)
    throw new WorkflowError(
      'Too many requests. Please wait and try again.',
      429,
    );
  return {
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.startedAt + windowMs,
  };
}

export function apiHeaders(id: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Request-Id', id);
  return headers;
}

export function apiJson(
  value: unknown,
  status = 200,
  id = crypto.randomUUID(),
) {
  return Response.json(value, { status, headers: apiHeaders(id) });
}

export function logRequest(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') console.error(entry);
  else console.log(entry);
}
