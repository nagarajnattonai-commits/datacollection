import { checkOrigin } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { issueRecordingUpload } from '@/lib/recording-upload';
import { WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = requestId(request);
  try {
    checkOrigin(request);
    enforceRateLimit(request, 'recording-resubmit', 20, 60 * 60_000);
    return apiJson(
      await issueRecordingUpload(request, (await context.params).id),
      200,
      traceId,
    );
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, traceId);
    return apiJson(
      { error: 'The replacement upload could not start. Please try again.' },
      500,
      traceId,
    );
  }
}
