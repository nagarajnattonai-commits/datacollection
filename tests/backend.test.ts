import test from 'node:test';
import assert from 'node:assert/strict';
import { audioCriteria, validateAudioCriteria } from '../lib/audio-criteria.ts';
import { enforceRateLimit, requestId } from '../lib/api.ts';
import { workspaceMetrics } from '../lib/metrics.ts';
import { initialState, type Task } from '../lib/workflow.ts';
import {
  validateIntakeAnswers,
  validateProjectConfig,
} from '../lib/project-schema.ts';
import {
  parseR2DirectUploadConfig,
  presignR2UploadPart,
} from '../lib/r2-presign.ts';
import {
  parseSupabaseStoreConfig,
  SupabaseWorkspaceStore,
} from '../lib/supabase-store.ts';

test('audio submissions require every current quality criterion', () => {
  const all = audioCriteria.map((criterion) => criterion.id);
  assert.deepEqual(validateAudioCriteria(JSON.stringify(all)), all);
  assert.deepEqual(validateAudioCriteria(all.slice(0, -1)), []);
  assert.deepEqual(validateAudioCriteria('not-json'), []);
});

test('project-driven intake accepts configured answers and rejects missing ones', () => {
  const config = initialState().config;
  assert.deepEqual(
    validateIntakeAnswers(config.intakeFields, {
      age_band: '25-34',
      native_language: 'Tamil',
      accent_region: 'Madurai',
    }),
    {
      age_band: '25-34',
      native_language: 'Tamil',
      accent_region: 'Madurai',
    },
  );
  assert.throws(() =>
    validateIntakeAnswers(config.intakeFields, { age_band: '25-34' }),
  );
  assert.equal(
    validateProjectConfig(config).technical.maxBytes,
    20 * 1024 * 1024,
  );
});

test('R2 upload parts receive bounded signed URLs without exposing the secret', async () => {
  assert.equal(parseR2DirectUploadConfig({}), null);
  const config = {
    accountId: '0123456789abcdef0123456789abcdef',
    bucket: 'fieldnote-audio',
    accessKeyId: 'access-key',
    secretAccessKey: 'do-not-expose-this-secret',
  };
  const url = await presignR2UploadPart(config, {
    key: 'audio/main/person/file.wav',
    uploadId: 'upload-id',
    partNumber: 2,
    contentType: 'audio/wav',
    expiresSeconds: 600,
    now: new Date('2026-01-02T03:04:05.000Z'),
  });
  assert.match(url, /partNumber=2/);
  assert.match(url, /X-Amz-Expires=600/);
  assert.match(url, /X-Amz-Signature=[a-f0-9]{64}/);
  assert.doesNotMatch(url, /do-not-expose-this-secret/);
});

test('request ids accept bounded safe values and replace unsafe input', () => {
  assert.equal(
    requestId(
      new Request('https://app.test', {
        headers: { 'x-request-id': 'safe_123' },
      }),
    ),
    'safe_123',
  );
  assert.notEqual(
    requestId(
      new Request('https://app.test', {
        headers: { 'x-request-id': '<script>' },
      }),
    ),
    '<script>',
  );
});

test('rate limit blocks excess requests and resets after its window', () => {
  const request = new Request('https://app.test', {
    headers: { 'cf-connecting-ip': '192.0.2.44' },
  });
  assert.equal(
    enforceRateLimit(request, 'test-scope', 2, 1000, 100).remaining,
    1,
  );
  assert.equal(
    enforceRateLimit(request, 'test-scope', 2, 1000, 200).remaining,
    0,
  );
  assert.throws(() => enforceRateLimit(request, 'test-scope', 2, 1000, 300));
  assert.equal(
    enforceRateLimit(request, 'test-scope', 2, 1000, 1100).remaining,
    1,
  );
});

test('monitoring reports queue, claims, team and delivery counts', () => {
  const state = initialState();
  state.members.push(
    { email: 'one@example.com', role: 'contributor' },
    { email: 'qa@example.com', role: 'qa' },
  );
  const task = {
    id: 'task-1',
    name: 'one.wav',
    contributor: 'one',
    created: 10,
    audioKey: 'audio/task-1',
    mime: 'audio/wav',
    bytes: 100,
    checksum: 'abc',
    language: 'ta',
    locale: 'ta-IN',
    status: 'STT_PENDING',
    transcript: '',
    originalTranscript: null,
    streak: 0,
    claim: { userId: 'qa', expires: 2000 },
    reviews: [],
    job: { attempts: 0, nextAttempt: 0 },
  } satisfies Task;
  state.tasks.push(task);
  const metrics = workspaceMetrics(state, 1000);
  assert.equal(metrics.team.total, 2);
  assert.equal(metrics.tasks.transcriptionBacklog, 1);
  assert.equal(metrics.tasks.activeClaims, 1);
  assert.equal(metrics.tasks.readyToDeliver, 0);
});

test('Supabase configuration requires a secure complete server connection', () => {
  assert.equal(parseSupabaseStoreConfig({}), null);
  assert.throws(() =>
    parseSupabaseStoreConfig({ DATABASE_PROVIDER: 'supabase' }),
  );
  assert.throws(() =>
    parseSupabaseStoreConfig({
      SUPABASE_URL: 'https://project.supabase.co',
    }),
  );
  assert.throws(() =>
    parseSupabaseStoreConfig({
      SUPABASE_URL: 'http://project.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    }),
  );
  assert.deepEqual(
    parseSupabaseStoreConfig({
      DATABASE_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://project.supabase.co/',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      SUPABASE_WORKSPACE_ID: 'fieldnote_main',
    }),
    {
      url: 'https://project.supabase.co',
      secretKey: 'sb_secret_test',
      workspaceId: 'fieldnote_main',
    },
  );
});

test('Supabase store initializes, reads and atomically updates a workspace', async () => {
  const state = initialState();
  const calls: { url: string; init: RequestInit }[] = [];
  const responses = [
    Response.json([]),
    new Response(null, { status: 201 }),
    Response.json([{ revision: 0, state }]),
    Response.json(true),
  ];
  const fetcher = (async (input: string | URL | Request, init = {}) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected Supabase request');
    return response;
  }) as typeof fetch;
  const store = new SupabaseWorkspaceStore(
    {
      url: 'https://project.supabase.co',
      secretKey: 'sb_secret_test',
      workspaceId: 'main',
    },
    fetcher,
  );
  assert.deepEqual(await store.read(), { revision: 0, state });
  assert.equal(await store.compareAndSwap(0, state), true);
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /\/rest\/v1\/fieldnote_workspaces\?/);
  assert.match(
    calls[3].url,
    /\/rest\/v1\/rpc\/fieldnote_compare_and_swap_workspace$/,
  );
  const headers = new Headers(calls[3].init.headers);
  assert.equal(headers.get('apikey'), 'sb_secret_test');
  assert.equal(headers.has('authorization'), false);
  assert.match(String(calls[3].init.body), /"p_expected_revision":0/);
});
