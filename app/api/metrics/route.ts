import { actorFor } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { workspaceMetrics } from '@/lib/metrics';
import { readState } from '@/lib/store';
import { WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'metrics', 60);
    const { state } = await readState();
    const actor = await actorFor(request, state);
    if (actor.role !== 'admin')
      throw new WorkflowError(
        'Only administrators can view system metrics.',
        403,
      );
    return apiJson(workspaceMetrics(state), 200, id);
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson({ error: 'Metrics are unavailable.' }, 500, id);
  }
}
