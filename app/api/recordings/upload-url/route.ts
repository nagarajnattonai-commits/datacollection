import { checkOrigin } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { issueRecordingUpload } from '@/lib/recording-upload';
import { WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    checkOrigin(request);
    enforceRateLimit(request, 'recording-upload-url', 30, 60 * 60_000);
    if (Number(request.headers.get('content-length')) > 20_000)
      throw new WorkflowError('Some upload details are invalid.', 400);
    return apiJson(await issueRecordingUpload(request), 200, id);
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson(
      { error: 'The upload could not start. Please try again.' },
      500,
      id,
    );
  }
}
