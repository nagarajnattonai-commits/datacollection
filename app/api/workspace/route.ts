import { env } from 'cloudflare:workers';
import { actorFor, checkOrigin, localDemo } from '@/lib/auth';
import { mutate, readState } from '@/lib/store';
import * as w from '@/lib/workflow';
import { sniffAudio } from '@/lib/audio';
import {
  audioCriteriaVersion,
  validateAudioCriteria,
} from '@/lib/audio-criteria';
import {
  apiHeaders,
  apiJson,
  enforceRateLimit,
  logRequest,
  requestId,
} from '@/lib/api';
export const dynamic = 'force-dynamic';
function fail(error: unknown, id: string) {
  if (error instanceof w.WorkflowError)
    return apiJson({ error: error.message }, error.status, id);
  logRequest('error', 'workspace_request_failed', {
    requestId: id,
    error: error instanceof Error ? error.message : 'Unknown failure',
  });
  return apiJson(
    { error: 'The workspace could not save this action. Please try again.' },
    500,
    id,
  );
}
function str(value: unknown, max = 50000): string {
  if (typeof value !== 'string' || value.length > max)
    throw new w.WorkflowError('Invalid text input.', 400);
  return value;
}
export async function GET(request: Request) {
  const traceId = requestId(request);
  try {
    enforceRateLimit(request, 'workspace-read', 180);
    const { state } = await readState();
    const actor = await actorFor(request, state);
    const url = new URL(request.url);
    if (url.searchParams.has('audio')) {
      const task = w.findTask(state, url.searchParams.get('audio')!);
      if (actor.role === 'contributor' && task.contributor !== actor.id)
        throw new w.WorkflowError('Access denied.', 403);
      const object = await env.FILES.get(task.audioKey);
      if (!object) throw new w.WorkflowError('Audio is unavailable.', 404);
      return new Response(object.body, {
        headers: apiHeaders(traceId, {
          'Content-Type': task.mime,
          'Content-Length': String(object.size),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        }),
      });
    }
    if (url.searchParams.has('export')) {
      if (!['admin', 'team_leader'].includes(actor.role))
        throw new w.WorkflowError(
          'Only administrators and team leaders can export delivery records.',
          403,
        );
      const records = state.tasks
        .filter((t) => t.status === 'READY_TO_DELIVER')
        .map((t) => ({
          id: t.id,
          filename: t.name,
          language: t.language,
          locale: t.locale,
          transcript: t.transcript,
          originalTranscript: t.originalTranscript,
          source: t.source,
          noEditStreak: t.streak,
          sha256: t.checksum,
          audioQuality: t.quality ?? null,
          audioPath: `/api/workspace?audio=${encodeURIComponent(t.id)}`,
          reviews: t.reviews,
        }));
      return new Response(
        JSON.stringify(
          {
            project: state.config.name,
            exportedAt: new Date().toISOString(),
            records,
          },
          null,
          2,
        ),
        {
          headers: apiHeaders(traceId, {
            'Content-Type': 'application/json',
            'Content-Disposition':
              'attachment; filename="fieldnote-delivery.json"',
            'Cache-Control': 'no-store',
          }),
        },
      );
    }
    const visible =
      actor.role === 'contributor'
        ? {
            ...state,
            tasks: state.tasks.filter((t) => t.contributor === actor.id),
            members: [],
            audit: state.audit.filter((a) => a.actor === actor.email),
            rounds: [],
          }
        : state;
    return apiJson(
      {
        state: visible,
        actor,
        demo: localDemo(request),
        automaticSttConfigured: !!env.OPENAI_API_KEY,
      },
      200,
      traceId,
    );
  } catch (error) {
    return fail(error, traceId);
  }
}
export async function POST(request: Request) {
  const traceId = requestId(request);
  try {
    enforceRateLimit(request, 'workspace-write', 90);
    checkOrigin(request);
    const { state } = await readState();
    const actor = await actorFor(request, state);
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      if (!['admin', 'contributor'].includes(actor.role))
        throw new w.WorkflowError(
          'Only contributors can submit recordings.',
          403,
        );
      if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024)
        throw new w.WorkflowError('Maximum upload size is 20 MB.', 413);
      const form = await request.formData();
      const file = form.get('audio');
      const confirmed = validateAudioCriteria(form.get('qualityChecks'));
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > 20 * 1024 * 1024
      )
        throw new w.WorkflowError('Choose an audio file up to 20 MB.', 400);
      if (!confirmed.length)
        throw new w.WorkflowError(
          'Confirm every audio quality check before submitting.',
          400,
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = sniffAudio(bytes);
      const checksum = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const taskId = crypto.randomUUID(),
        audioKey = `audio/${taskId}`;
      await env.FILES.put(audioKey, bytes, {
        httpMetadata: { contentType: mime },
      });
      try {
        await mutate((s) => {
          const task: w.Task = {
            id: taskId,
            name: file.name.slice(0, 180),
            contributor: actor.id,
            created: Date.now(),
            audioKey,
            mime,
            bytes: file.size,
            checksum,
            quality: {
              criteriaVersion: audioCriteriaVersion,
              confirmed,
              confirmedAt: Date.now(),
            },
            language: s.config.language,
            locale: s.config.locale,
            status: 'QUICK_REVIEW',
            transcript: '',
            originalTranscript: null,
            streak: 0,
            reviews: [],
            job: { attempts: 0, nextAttempt: 0 },
          };
          w.addTask(s, actor, task, Date.now());
        });
      } catch (error) {
        await env.FILES.delete(audioKey);
        throw error;
      }
      logRequest('info', 'audio_submitted', {
        requestId: traceId,
        actorId: actor.id,
        role: actor.role,
        taskId,
        bytes: file.size,
        mime,
      });
      return apiJson({ id: taskId }, 201, traceId);
    }
    if (Number(request.headers.get('content-length')) > 100000)
      throw new w.WorkflowError('Request is too large.', 413);
    const data = (await request.json()) as Record<string, unknown>;
    const action = str(data.action, 40);
    const now = Date.now();
    const result = await mutate((s) => {
      if (action === 'claim') {
        if (data.kind !== 'quick' && data.kind !== 'deep')
          throw new w.WorkflowError('Unknown review type.', 400);
        return w.claimTasks(s, actor, data.kind, Number(data.count ?? 5), now);
      }
      if (action === 'quick') {
        if (typeof data.approved !== 'boolean')
          throw new w.WorkflowError('Choose approve or request retake.', 400);
        return w.quickReview(
          s,
          actor,
          str(data.id, 100),
          data.approved,
          str(data.note ?? '', 1000),
          now,
        );
      }
      if (action === 'deep')
        return w.deepReview(s, actor, str(data.id, 100), str(data.text), now);
      if (action === 'openRound') return w.openRound(s, actor, now);
      if (action === 'closeRound') return w.closeRound(s, actor, now);
      if (action === 'retry')
        return w.retryJob(s, actor, str(data.id, 100), now);
      if (action === 'transcript')
        return w.setTranscript(
          s,
          actor,
          str(data.id, 100),
          str(data.text),
          'manual import',
          now,
        );
      if (!['admin', 'team_leader'].includes(actor.role))
        throw new w.WorkflowError(
          'Only administrators and team leaders can manage this workspace.',
          403,
        );
      if (action === 'config') {
        const name = str(data.name, 120).trim(),
          language = str(data.language, 10).trim(),
          locale = str(data.locale, 30).trim();
        if (
          !name ||
          !/^[a-z]{2,3}$/.test(language) ||
          !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})+$/.test(locale) ||
          locale.split('-')[0] !== language
        )
          throw new w.WorkflowError(
            'Use a language code and matching locale, for example ta and ta-IN.',
            400,
          );
        if (data.provider !== 'manual' && data.provider !== 'openai')
          throw new w.WorkflowError(
            'Choose a supported transcription provider.',
            400,
          );
        s.config = {
          name,
          language,
          locale,
          requirements: str(data.requirements, 4000),
          vocabulary: str(data.vocabulary ?? '', 2000),
          provider: data.provider,
        };
        w.audit(s, actor, 'Project settings updated', now);
        return;
      }
      if (action === 'member') {
        if (actor.role !== 'admin')
          throw new w.WorkflowError(
            'Only administrators can manage team access.',
            403,
          );
        const email = str(data.email, 200).trim().toLowerCase();
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !['contributor', 'qa', 'team_leader', 'admin'].includes(
            String(data.role),
          )
        )
          throw new w.WorkflowError('Enter a valid email and team role.', 400);
        const member = s.members.find((m) => m.email === email);
        if (member) member.role = data.role as w.Role;
        else s.members.push({ email, role: data.role as w.Role });
        w.audit(s, actor, 'Team member role updated', now);
        return;
      }
      throw new w.WorkflowError('Unknown action.', 400);
    });
    logRequest('info', 'workspace_action_completed', {
      requestId: traceId,
      actorId: actor.id,
      role: actor.role,
      action,
    });
    return apiJson({ ok: true, result }, 200, traceId);
  } catch (error) {
    if (error instanceof SyntaxError)
      return apiJson({ error: 'Invalid request.' }, 400, traceId);
    return fail(error, traceId);
  }
}
