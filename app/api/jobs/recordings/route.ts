import { env } from 'cloudflare:workers';
import { apiJson, enforceRateLimit, logRequest, requestId } from '@/lib/api';
import { sniffAudio } from '@/lib/audio';
import { mutate, readState } from '@/lib/store';
import {
  finishPostProcessJob,
  leasePostProcessJob,
  WorkflowError,
} from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'recording-post-process', 120);
    if (
      !env.WORKER_SECRET ||
      request.headers.get('authorization') !== `Bearer ${env.WORKER_SECRET}`
    )
      return apiJson({ error: 'Unauthorized' }, 401, id);
    const lease = crypto.randomUUID();
    const task = await mutate((state) =>
      leasePostProcessJob(state, Date.now(), lease),
    );
    if (!task) return apiJson({ idle: true }, 200, id);
    let result: { checksum?: string; mime?: string; error?: string };
    try {
      const object = await env.FILES.get(task.audioKey);
      if (!object || object.size !== task.bytes)
        throw new Error('The uploaded file is incomplete.');
      const bytes = new Uint8Array(await object.arrayBuffer());
      const mime = sniffAudio(bytes);
      const { state } = await readState();
      if (!state.config.technical.formats.includes(mime))
        throw new Error('The file format is not accepted for this project.');
      if (
        !task.durationSeconds ||
        task.durationSeconds < state.config.technical.minDurationSeconds ||
        task.durationSeconds > state.config.technical.maxDurationSeconds
      )
        throw new Error('The recording length is outside the project range.');
      const checksum = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      ]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      result = { checksum, mime };
    } catch (error) {
      result = {
        error:
          error instanceof Error
            ? error.message
            : 'The audio file could not be verified.',
      };
    }
    await mutate((state) =>
      finishPostProcessJob(state, task.id, lease, result, Date.now()),
    );
    logRequest('info', 'recording_post_process_finished', {
      requestId: id,
      taskId: task.id,
      success: Boolean(result.checksum),
    });
    return apiJson({ taskId: task.id, success: !!result.checksum }, 200, id);
  } catch (error) {
    const status = error instanceof WorkflowError ? error.status : 500;
    logRequest('error', 'recording_post_process_failed', {
      requestId: id,
      error: error instanceof Error ? error.message : 'Unknown failure',
    });
    return apiJson({ error: 'Audio validation could not run.' }, status, id);
  }
}
