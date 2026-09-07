import { checkOrigin } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { completeRecordingUpload } from '@/lib/recording-upload';
import { WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    checkOrigin(request);
    enforceRateLimit(request, 'recording-complete', 30, 60 * 60_000);
    if (Number(request.headers.get('content-length')) > 100_000)
      throw new WorkflowError('Some recording details are invalid.', 400);
    return apiJson(await completeRecordingUpload(request), 201, id);
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson(
      { error: 'The recording could not be submitted. Please try again.' },
      500,
      id,
    );
  }
}
