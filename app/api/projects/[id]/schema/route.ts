import { actorFor } from '@/lib/auth';
import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { cachedProjectAccess } from '@/lib/project-schema';
import { directUploadConfigured } from '@/lib/recording-upload';
import { readState } from '@/lib/store';
import { initialState, WorkflowError } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'project-schema', 180);
    const projectId = (await context.params).id;
    const access = await cachedProjectAccess(projectId, async () => {
      const { state } = await readState();
      return { schema: state.config, members: state.members };
    });
    const authState = initialState();
    authState.config = access.schema;
    authState.members = access.members;
    await actorFor(request, authState);
    if (projectId !== access.schema.id)
      throw new WorkflowError('Project requirements were not found.', 404);
    return apiJson(
      {
        schema: access.schema,
        directUploadConfigured: directUploadConfigured(),
      },
      200,
      id,
    );
  } catch (error) {
    if (error instanceof WorkflowError)
      return apiJson({ error: error.message }, error.status, id);
    return apiJson({ error: 'Project requirements are unavailable.' }, 500, id);
  }
}
