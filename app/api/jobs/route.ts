import { env } from 'cloudflare:workers';
import { mutate, readState } from '@/lib/store';
import { leaseJob, finishJob } from '@/lib/workflow';
import { apiJson, enforceRateLimit, logRequest, requestId } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const id = requestId(request);
  try {
    enforceRateLimit(request, 'transcription-worker', 120);
    if (
      !env.WORKER_SECRET ||
      request.headers.get('authorization') !== `Bearer ${env.WORKER_SECRET}`
    )
      return apiJson({ error: 'Unauthorized' }, 401, id);
    const { state } = await readState();
    if (state.config.provider !== 'openai')
      return apiJson(
        { idle: true, reason: 'Manual transcript import selected.' },
        200,
        id,
      );
    if (!env.OPENAI_API_KEY)
      return apiJson(
        { error: 'Transcription provider is not configured.' },
        503,
        id,
      );
    const lease = crypto.randomUUID();
    const task = await mutate((s) => leaseJob(s, Date.now(), lease));
    if (!task) return apiJson({ idle: true }, 200, id);
    let result: { text?: string; error?: string };
    try {
      const object = await env.FILES.get(task.audioKey);
      if (!object) throw new Error('Audio file is missing.');
      const form = new FormData();
      form.set(
        'file',
        new Blob([await object.arrayBuffer()], { type: task.mime }),
        task.name,
      );
      form.set('model', env.STT_MODEL || 'gpt-4o-mini-transcribe');
      form.set('language', task.language);
      form.set('prompt', `Locale: ${task.locale}. ${state.config.vocabulary}`);
      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: form,
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Transcription provider returned HTTP ${response.status}.`,
        );
      const data = (await response.json()) as { text?: string };
      if (!data.text?.trim() || data.text.length > 50000)
        throw new Error(
          'The provider returned an empty or oversized transcript.',
        );
      result = { text: data.text };
    } catch (error) {
      result = {
        error: error instanceof Error ? error.message : 'Transcription failed.',
      };
    }
    await mutate((s) => finishJob(s, task.id, lease, result, Date.now()));
    logRequest('info', 'transcription_job_finished', {
      requestId: id,
      taskId: task.id,
      success: Boolean(result.text),
    });
    return apiJson({ taskId: task.id, success: !!result.text }, 200, id);
  } catch (error) {
    logRequest('error', 'transcription_worker_failed', {
      requestId: id,
      error: error instanceof Error ? error.message : 'Unknown failure',
    });
    const status =
      error instanceof Error &&
      'status' in error &&
      typeof error.status === 'number'
        ? error.status
        : 500;
    return apiJson(
      { error: 'The transcription worker request failed.' },
      status,
      id,
    );
  }
}
