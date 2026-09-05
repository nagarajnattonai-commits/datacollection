import test from 'node:test';
import assert from 'node:assert/strict';
import { audioCriteria, validateAudioCriteria } from '../lib/audio-criteria.ts';
import { enforceRateLimit, requestId } from '../lib/api.ts';
import { workspaceMetrics } from '../lib/metrics.ts';
import { initialState, type Task } from '../lib/workflow.ts';

test('audio submissions require every current quality criterion', () => {
  const all = audioCriteria.map((criterion) => criterion.id);
  assert.deepEqual(validateAudioCriteria(JSON.stringify(all)), all);
  assert.deepEqual(validateAudioCriteria(all.slice(0, -1)), []);
  assert.deepEqual(validateAudioCriteria('not-json'), []);
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
