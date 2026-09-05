import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  addTask,
  claimTasks,
  quickReview,
  setTranscript,
  openRound,
  deepReview,
  closeRound,
  leaseJob,
  finishJob,
  retryJob,
  type Actor,
  type Task,
  type State,
} from '../lib/workflow.ts';
import { sniffAudio } from '../lib/audio.ts';
const admin: Actor = { id: 'admin', email: 'admin@test.local', role: 'admin' },
  teamLeader: Actor = {
    id: 'leader',
    email: 'leader@test.local',
    role: 'team_leader',
  },
  qa: Actor = { id: 'qa', email: 'qa@test.local', role: 'qa' },
  other: Actor = { id: 'other', email: 'other@test.local', role: 'qa' },
  contributor: Actor = {
    id: 'contributor',
    email: 'contributor@test.local',
    role: 'contributor',
  };
function recording(id = 'one'): Task {
  return {
    id,
    name: 'sample.wav',
    contributor: contributor.id,
    created: 0,
    audioKey: id,
    mime: 'audio/wav',
    bytes: 100,
    checksum: 'abc',
    language: 'ta',
    locale: 'ta-IN',
    status: 'QUICK_REVIEW',
    transcript: '',
    originalTranscript: null,
    streak: 0,
    reviews: [],
    job: { attempts: 0, nextAttempt: 0 },
  };
}
function approved() {
  const s = initialState();
  addTask(s, contributor, recording(), 0);
  claimTasks(s, qa, 'quick', 1, 1);
  quickReview(s, qa, 'one', true, '', 2);
  return s;
}
function transcribed() {
  const s = approved();
  setTranscript(s, admin, 'one', 'Original transcript', 'manual import', 3);
  return s;
}
function round(s: State, text: string) {
  openRound(s, admin, 10);
  claimTasks(s, qa, 'deep', 1, 11);
  deepReview(s, qa, 'one', text, 12);
  closeRound(s, admin, 13);
}
test('exclusive claims, owner checks and claim expiry', () => {
  const s = initialState();
  s.tasks.push(recording());
  assert.deepEqual(claimTasks(s, qa, 'quick', 1, 0), ['one']);
  assert.deepEqual(claimTasks(s, other, 'quick', 1, 1), []);
  assert.throws(() => quickReview(s, other, 'one', true, '', 2));
  assert.deepEqual(claimTasks(s, other, 'quick', 1, 900001), ['one']);
  assert.throws(() => quickReview(s, qa, 'one', true, '', 900002));
});
test('a reviewer cannot claim their own contribution', () => {
  const s = initialState();
  s.tasks.push({ ...recording(), contributor: qa.id });
  assert.deepEqual(claimTasks(s, qa, 'quick', 1, 0), []);
});
test('existing claims count toward the requested batch', () => {
  const s = initialState();
  s.tasks.push(recording('one'), recording('two'));
  claimTasks(s, qa, 'quick', 1, 0);
  assert.equal(claimTasks(s, qa, 'quick', 1, 1).length, 1);
  assert.equal(s.tasks.filter((t) => t.claim).length, 1);
});
test('only approved audio enters the transcription queue', () => {
  const s = initialState();
  s.tasks.push(recording());
  assert.equal(leaseJob(s, 0, 'lease'), null);
  claimTasks(s, qa, 'quick', 1, 0);
  assert.throws(() => quickReview(s, qa, 'one', false, '', 1));
  quickReview(s, qa, 'one', false, 'Too much background noise', 2);
  assert.equal(s.tasks[0].status, 'REJECTED');
  assert.equal(leaseJob(s, 3, 'lease'), null);
});
test('exactly three consecutive no-edit rounds finalize the recording', () => {
  const s = transcribed();
  round(s, 'Original transcript');
  assert.equal(s.tasks[0].streak, 1);
  round(s, 'Original transcript');
  assert.equal(s.tasks[0].status, 'DEEP_REVIEW');
  round(s, 'Original transcript');
  assert.equal(s.tasks[0].status, 'READY_TO_DELIVER');
  assert.throws(() => openRound(s, admin, 20));
});
test('an edit resets the streak and preserves the original and history', () => {
  const s = transcribed();
  round(s, 'Original transcript');
  round(s, 'Original transcript');
  round(s, 'Corrected transcript');
  assert.equal(s.tasks[0].streak, 0);
  assert.equal(s.tasks[0].originalTranscript, 'Original transcript');
  assert.equal(s.tasks[0].reviews[2].before, 'Original transcript');
  round(s, 'Corrected transcript');
  assert.equal(s.tasks[0].streak, 1);
});
test('rounds cannot close early or accept a second submission', () => {
  const s = transcribed();
  openRound(s, admin, 4);
  assert.throws(() => closeRound(s, admin, 5));
  claimTasks(s, qa, 'deep', 1, 6);
  deepReview(s, qa, 'one', 'Original transcript', 7);
  assert.throws(() => deepReview(s, qa, 'one', 'Again', 8));
  assert.deepEqual(claimTasks(s, other, 'deep', 1, 8), []);
  closeRound(s, admin, 9);
  assert.throws(() => closeRound(s, admin, 10));
  assert.equal(s.tasks[0].streak, 1);
});
test('late transcripts wait until the next round', () => {
  const s = transcribed();
  openRound(s, admin, 4);
  s.tasks.push({
    ...recording('late'),
    status: 'DEEP_REVIEW',
    transcript: 'Late',
  });
  assert.deepEqual(s.rounds[0].taskIds, ['one']);
  assert.deepEqual(claimTasks(s, qa, 'deep', 5, 5), ['one']);
});
test('contributors cannot review or control rounds', () => {
  const s = transcribed();
  assert.throws(() => claimTasks(s, contributor, 'deep', 1, 5));
  assert.throws(() => openRound(s, contributor, 5));
  assert.throws(() => setTranscript(s, qa, 'one', 'Wrong role', 'manual', 5));
});
test('team leaders can run project operations without administrator identity', () => {
  const s = approved();
  setTranscript(s, teamLeader, 'one', 'Original transcript', 'manual', 3);
  openRound(s, teamLeader, 4);
  assert.deepEqual(claimTasks(s, teamLeader, 'deep', 1, 5), ['one']);
  deepReview(s, teamLeader, 'one', 'Original transcript', 6);
  closeRound(s, teamLeader, 7);
  assert.equal(s.tasks[0].streak, 1);
});
test('job leases exclude concurrent workers and reject stale results', () => {
  const s = approved();
  const task = leaseJob(s, 10, 'first');
  assert.equal(task?.id, 'one');
  assert.equal(leaseJob(s, 11, 'second'), null);
  leaseJob(s, 180011, 'second');
  assert.throws(() => finishJob(s, 'one', 'first', { text: 'Stale' }, 180012));
  finishJob(s, 'one', 'second', { text: 'Actual transcript' }, 180013);
  assert.equal(s.tasks[0].originalTranscript, 'Actual transcript');
  assert.equal(s.tasks[0].status, 'DEEP_REVIEW');
});
test('failed transcription retries stop at three attempts', () => {
  const s = approved();
  for (let i = 0; i < 3; i++) {
    const now = i * 1_000_000;
    leaseJob(s, now, `lease-${i}`);
    finishJob(
      s,
      'one',
      `lease-${i}`,
      { error: 'Provider unavailable' },
      now + 1,
    );
  }
  assert.equal(s.tasks[0].status, 'STT_FAILED');
  assert.equal(leaseJob(s, 9_000_000, 'fourth'), null);
  retryJob(s, admin, 'one', 9_000_001);
  assert.equal(s.tasks[0].job.attempts, 0);
  assert.equal(s.tasks[0].status, 'STT_PENDING');
});
test('file signatures reject text masquerading as audio', () => {
  assert.throws(() =>
    sniffAudio(new TextEncoder().encode('This is not audio at all.')),
  );
  const bytes = new Uint8Array(44);
  bytes.set(new TextEncoder().encode('RIFF'));
  bytes.set(new TextEncoder().encode('WAVE'), 8);
  assert.equal(sniffAudio(bytes), 'audio/wav');
});
