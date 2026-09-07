import { actorFor } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { readState } from '@/lib/store';
import { findTask, WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = requestId(request);
  try {
    enforceRateLimit(request, 'recording-detail', 180);
    const { state } = await readState();
    const actor = await actorFor(request, state);
    const task = findTask(state, (await context.params).id);
    if (actor.role === 'contributor' && task.contributor !== actor.id)
      throw new WorkflowError('Recording access denied.', 403);
    return apiJson({ recording: task }, 200, traceId);
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, traceId);
    return apiJson(
      { error: 'Recording details are unavailable.' },
      500,
      traceId,
    );
  }
}
