import { actorFor } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { cachedProjectSchema } from '@/lib/project-schema';
import { directUploadConfigured } from '@/lib/recording-upload';
import { readState } from '@/lib/store';
import { WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'project-schema', 180);
    const projectId = (await context.params).id;
    const { state } = await readState();
    await actorFor(request, state);
    if (projectId !== state.config.id)
      throw new WorkflowError('Project requirements were not found.', 404);
    const schema = await cachedProjectSchema(
      projectId,
      async () => state.config,
    );
    return apiJson(
      { schema, directUploadConfigured: directUploadConfigured() },
      200,
      id,
    );
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson({ error: 'Project requirements are unavailable.' }, 500, id);
  }
}
