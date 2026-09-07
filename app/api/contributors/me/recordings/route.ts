import { actorFor } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { readState } from '@/lib/store';
import { WorkflowError, type Status } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const contributorStatuses: Record<string, Status[]> = {
  pending_review: ['PROCESSING', 'QUICK_REVIEW'],
  needs_redo: ['REJECTED'],
  approved: ['STT_PENDING', 'STT_PROCESSING', 'STT_FAILED', 'DEEP_REVIEW'],
  delivered: ['READY_TO_DELIVER'],
};

function contributorStatus(status: Status) {
  return Object.entries(contributorStatuses).find(([, values]) =>
    values.includes(status),
  )?.[0];
}

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'contributor-recordings', 180);
    const { state } = await readState();
    const actor = await actorFor(request, state);
    if (!['contributor', 'admin'].includes(actor.role))
      throw new WorkflowError('Contributor access is required.', 403);
    const requestedStatus = new URL(request.url).searchParams.get('status');
    const statuses = new Set<Status>([
      'PROCESSING',
      'QUICK_REVIEW',
      'REJECTED',
      'STT_PENDING',
      'STT_PROCESSING',
      'STT_FAILED',
      'DEEP_REVIEW',
      'READY_TO_DELIVER',
    ]);
    if (
      requestedStatus &&
      !statuses.has(requestedStatus as Status) &&
      !(requestedStatus in contributorStatuses)
    )
      throw new WorkflowError('Choose a valid recording status.', 400);
    const recordings = state.tasks
      .filter(
        (task) =>
          task.contributor === actor.id &&
          (!requestedStatus ||
            task.status === requestedStatus ||
            contributorStatuses[requestedStatus]?.includes(task.status)),
      )
      .map((task) => ({
        ...task,
        contributorStatus: contributorStatus(task.status),
      }));
    return apiJson({ recordings }, 200, id);
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson({ error: 'Recordings are unavailable.' }, 500, id);
  }
}
