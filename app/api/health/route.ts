import { env } from 'cloudflare:workers';
import { apiJson, logRequest, requestId } from '@/lib/api';
import { readState } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await readState();
    await env.FILES.head('__fieldnote_healthcheck__');
    return apiJson(
      {
        status: 'ok',
        service: 'fieldnote-backend',
        checks: { database: 'ok', objectStorage: 'ok' },
        timestamp: new Date().toISOString(),
      },
      200,
      id,
    );
  } catch (error) {
    logRequest('error', 'health_check_failed', {
      requestId: id,
      error: error instanceof Error ? error.message : 'Unknown failure',
    });
    return apiJson(
      {
        status: 'unavailable',
        service: 'fieldnote-backend',
        checks: { database: 'unknown', objectStorage: 'unknown' },
        timestamp: new Date().toISOString(),
      },
      503,
      id,
    );
  }
}
