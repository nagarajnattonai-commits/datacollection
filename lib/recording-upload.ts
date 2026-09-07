import { env } from 'cloudflare:workers';
import { actorFor } from './auth.ts';
import { enforceRateLimit } from './api.ts';
import {
  audioCriteriaVersion,
  validateAudioCriteria,
} from './audio-criteria.ts';
import { validateIntakeAnswers } from './project-schema.ts';
import {
  parseR2DirectUploadConfig,
  presignR2UploadPart,
} from './r2-presign.ts';
import { mutate, readState } from './store.ts';
import {
  findTask,
  MAX_RECORDINGS,
  WorkflowError,
  type Actor,
  type State,
  type Task,
  type UploadSession,
} from './workflow.ts';

const PART_SIZE = 5 * 1024 * 1024;
const SESSION_TTL = 15 * 60_000;

type UploadRequest = {
  projectId: string;
  name: string;
  mime: string;
  bytes: number;
  durationSeconds: number;
  idempotencyKey: string;
};

export function directUploadConfigured() {
  try {
    return parseR2DirectUploadConfig(env) !== null;
  } catch {
    return false;
  }
}

export async function issueRecordingUpload(
  request: Request,
  resubmitTaskId?: string,
) {
  const input = parseUploadRequest(await request.json());
  const { state } = await readState();
  const actor = await actorFor(request, state);
  assertContributor(actor);
  enforceRateLimit(request, `recording-upload:${actor.id}`, 30, 60 * 60_000);
  validateUploadAgainstProject(state, actor, input, resubmitTaskId);
  const existingTask = state.tasks.find(
    (task) =>
      task.contributor === actor.id &&
      task.idempotencyKey === input.idempotencyKey,
  );
  if (existingTask)
    return { alreadySubmitted: true, recordingId: existingTask.id };

  const existing = state.uploads.find(
    (session) =>
      session.contributor === actor.id &&
      session.idempotencyKey === input.idempotencyKey &&
      session.expires > Date.now(),
  );
  if (existing) return uploadInstructions(existing);

  const config = directUploadConfig();
  if (!config)
    throw new WorkflowError(
      'Direct upload is not available yet. Please try again later.',
      503,
    );
  const id = crypto.randomUUID();
  const safeName = input.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-100);
  const key = `audio/${state.config.id}/${actor.id}/${id}/${safeName}`;
  const multipart = await env.FILES.createMultipartUpload(key, {
    httpMetadata: { contentType: input.mime },
    customMetadata: {
      contributor: actor.id.slice(0, 100),
      project: state.config.id,
      uploadSession: id,
    },
  });
  const now = Date.now();
  const session: UploadSession = {
    id,
    storageUploadId: multipart.uploadId,
    key,
    contributor: actor.id,
    projectId: state.config.id,
    idempotencyKey: input.idempotencyKey,
    name: input.name,
    mime: input.mime,
    bytes: input.bytes,
    durationSeconds: input.durationSeconds,
    partSize: PART_SIZE,
    partCount: Math.ceil(input.bytes / PART_SIZE),
    created: now,
    expires: now + SESSION_TTL,
    resubmitTaskId,
  };
  try {
    await mutate((current) => {
      current.uploads = current.uploads.filter(
        (upload) => upload.expires > now,
      );
      if (
        current.uploads.some(
          (upload) =>
            upload.contributor === actor.id &&
            upload.idempotencyKey === input.idempotencyKey,
        )
      )
        throw new WorkflowError('This upload is already in progress.', 409);
      current.uploads.push(session);
      current.uploadMetrics.requested += 1;
    });
  } catch (error) {
    await multipart.abort().catch(() => {});
    throw error;
  }
  return uploadInstructions(session);
}

export async function completeRecordingUpload(request: Request) {
  const value = (await request.json()) as Record<string, unknown>;
  const sessionId = text(value.sessionId, 100);
  const idempotencyKey = text(value.idempotencyKey, 100);
  const { state } = await readState();
  const actor = await actorFor(request, state);
  assertContributor(actor);
  enforceRateLimit(request, `recording-complete:${actor.id}`, 30, 60 * 60_000);
  const alreadySubmitted = state.tasks.find(
    (task) =>
      task.contributor === actor.id && task.idempotencyKey === idempotencyKey,
  );
  if (alreadySubmitted) return { id: alreadySubmitted.id, duplicate: true };
  const session = state.uploads.find(
    (upload) =>
      upload.id === sessionId &&
      upload.contributor === actor.id &&
      upload.idempotencyKey === idempotencyKey,
  );
  if (!session || session.expires <= Date.now())
    throw new WorkflowError(
      'This upload session expired. Start the upload again.',
      410,
    );
  const parts = parseParts(value.parts, session.partCount);
  const metadata = validateIntakeAnswers(
    state.config.intakeFields,
    value.metadata,
  );
  const confirmed = validateAudioCriteria(value.qualityChecks);
  if (!confirmed.length)
    throw new WorkflowError(
      'Confirm every audio quality check before submitting.',
      400,
    );
  if (state.config.consent?.required && value.consentAccepted !== true)
    throw new WorkflowError(
      'Accept the project consent before submitting.',
      400,
    );

  let object = await env.FILES.head(session.key);
  if (!object) {
    const multipart = env.FILES.resumeMultipartUpload(
      session.key,
      session.storageUploadId,
    );
    try {
      object = await multipart.complete(parts);
    } catch {
      await countUploadFailure();
      throw new WorkflowError(
        'Some upload parts are missing. Retry the upload and submit again.',
        409,
      );
    }
  }
  if (object.size !== session.bytes) {
    await env.FILES.delete(session.key);
    await countUploadFailure();
    throw new WorkflowError(
      'The uploaded file was incomplete. Please upload it again.',
      400,
    );
  }
  const now = Date.now();
  const taskId = session.resubmitTaskId ?? crypto.randomUUID();
  await mutate((current) => {
    const currentSession = current.uploads.find(
      (upload) => upload.id === session.id && upload.contributor === actor.id,
    );
    const duplicate = current.tasks.find(
      (task) =>
        task.contributor === actor.id &&
        task.idempotencyKey === session.idempotencyKey,
    );
    if (duplicate) return;
    if (!currentSession)
      throw new WorkflowError('This upload has already been completed.', 409);
    const base = taskFromSession(
      current,
      actor,
      currentSession,
      taskId,
      metadata,
      confirmed,
      value.consentAccepted === true,
      now,
    );
    if (currentSession.resubmitTaskId) {
      const existing = findTask(current, currentSession.resubmitTaskId);
      if (existing.contributor !== actor.id || existing.status !== 'REJECTED')
        throw new WorkflowError('This recording cannot be resubmitted.', 409);
      existing.attempts ??= [];
      existing.attempts.push({
        audioKey: existing.audioKey,
        name: existing.name,
        mime: existing.mime,
        bytes: existing.bytes,
        checksum: existing.checksum,
        durationSeconds: existing.durationSeconds,
        submittedAt: existing.created,
        feedback: existing.quick?.note,
      });
      Object.assign(existing, base, {
        id: existing.id,
        attempts: existing.attempts,
      });
    } else {
      if (current.tasks.length >= MAX_RECORDINGS)
        throw new WorkflowError(
          'This workspace has reached its recording capacity.',
        );
      current.tasks.push(base);
    }
    current.uploads = current.uploads.filter(
      (upload) => upload.id !== currentSession.id,
    );
    current.uploadMetrics.completed += 1;
    current.uploadMetrics.totalUploadMilliseconds +=
      now - currentSession.created;
    current.audit.push({
      actor: actor.email,
      action: currentSession.resubmitTaskId
        ? 'Recording resubmitted'
        : 'Audio uploaded and queued for validation',
      taskId,
      at: now,
    });
  });
  return { id: taskId, status: 'processing' };
}

async function uploadInstructions(session: UploadSession) {
  const config = directUploadConfig();
  if (!config)
    throw new WorkflowError('Direct upload is not available yet.', 503);
  const urls = await Promise.all(
    Array.from({ length: session.partCount }, (_, index) =>
      presignR2UploadPart(config, {
        key: session.key,
        uploadId: session.storageUploadId,
        partNumber: index + 1,
        contentType: session.mime,
        expiresSeconds: 600,
      }),
    ),
  );
  return {
    sessionId: session.id,
    idempotencyKey: session.idempotencyKey,
    partSize: session.partSize,
    expiresAt: session.expires,
    contentType: session.mime,
    parts: urls.map((url, index) => ({ partNumber: index + 1, url })),
  };
}

function parseUploadRequest(value: unknown): UploadRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkflowError('Choose an audio file to upload.', 400);
  const input = value as Record<string, unknown>;
  const bytes = Number(input.bytes);
  const durationSeconds = Number(input.durationSeconds);
  return {
    projectId: text(input.projectId, 64),
    name: text(input.name, 180),
    mime: text(input.mime, 100).toLowerCase(),
    bytes,
    durationSeconds,
    idempotencyKey: text(input.idempotencyKey, 100),
  };
}

function validateUploadAgainstProject(
  state: State,
  actor: Actor,
  input: UploadRequest,
  resubmitTaskId?: string,
) {
  if (input.projectId !== state.config.id)
    throw new WorkflowError('This project is no longer available.', 404);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey))
    throw new WorkflowError('Restart this upload and try again.', 400);
  if (
    !Number.isSafeInteger(input.bytes) ||
    input.bytes < 1 ||
    input.bytes > state.config.technical.maxBytes
  )
    throw new WorkflowError('This audio file is too large.', 400);
  if (!state.config.technical.formats.includes(input.mime))
    throw new WorkflowError(
      'Choose one of the project’s accepted audio formats.',
      400,
    );
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds < state.config.technical.minDurationSeconds ||
    input.durationSeconds > state.config.technical.maxDurationSeconds
  )
    throw new WorkflowError(
      'The recording length is outside the project range.',
      400,
    );
  if (resubmitTaskId) {
    const task = findTask(state, resubmitTaskId);
    if (task.contributor !== actor.id || task.status !== 'REJECTED')
      throw new WorkflowError('This recording cannot be resubmitted.', 409);
  }
}

function taskFromSession(
  state: State,
  actor: Actor,
  session: UploadSession,
  id: string,
  metadata: Task['metadata'],
  confirmed: string[],
  consentAccepted: boolean,
  now: number,
): Task {
  return {
    id,
    name: session.name,
    contributor: actor.id,
    created: now,
    audioKey: session.key,
    mime: session.mime,
    bytes: session.bytes,
    checksum: '',
    projectId: session.projectId,
    durationSeconds: session.durationSeconds,
    metadata,
    consent:
      consentAccepted && state.config.consent
        ? {
            version: state.config.consent.version,
            text: state.config.consent.text,
            accepted: true,
            acceptedAt: now,
          }
        : undefined,
    idempotencyKey: session.idempotencyKey,
    quality: {
      criteriaVersion: audioCriteriaVersion,
      confirmed,
      confirmedAt: now,
    },
    language: state.config.language,
    locale: state.config.locale,
    status: 'PROCESSING',
    postProcess: { status: 'queued', attempts: 0, nextAttempt: now },
    transcript: '',
    originalTranscript: null,
    streak: 0,
    reviews: [],
    job: { attempts: 0, nextAttempt: 0 },
  };
}

function parseParts(value: unknown, expected: number): R2UploadedPart[] {
  if (!Array.isArray(value) || value.length !== expected)
    throw new WorkflowError('The upload is incomplete.', 400);
  const parts = value
    .map((part) => {
      const item = part as Record<string, unknown>;
      const partNumber = Number(item.partNumber);
      const etag = text(item.etag, 128).replace(/^"|"$/g, '');
      if (!Number.isInteger(partNumber) || !/^[A-Fa-f0-9-]{16,128}$/.test(etag))
        throw new WorkflowError('An uploaded part is invalid.', 400);
      return { partNumber, etag };
    })
    .sort((left, right) => left.partNumber - right.partNumber);
  if (parts.some((part, index) => part.partNumber !== index + 1))
    throw new WorkflowError('The upload is incomplete.', 400);
  return parts;
}

function assertContributor(actor: Actor) {
  if (!['contributor', 'admin'].includes(actor.role))
    throw new WorkflowError('Only contributors can submit recordings.', 403);
}

function directUploadConfig() {
  try {
    return parseR2DirectUploadConfig(env);
  } catch {
    throw new WorkflowError(
      'Direct audio storage is not fully configured. Please contact the project administrator.',
      503,
    );
  }
}

async function countUploadFailure() {
  await mutate((state) => {
    state.uploadMetrics.failed += 1;
  }).catch(() => {});
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new WorkflowError('Some upload details are invalid.', 400);
  return value.trim();
}
