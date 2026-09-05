import assert from 'node:assert/strict';
const base = process.env.APP_URL || 'http://localhost:3000';
async function request(role, body) {
  const r = await fetch(`${base}/api/workspace`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-demo-role': role,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const before = await request('admin');
assert.equal(before.status, 200);
assert.equal(
  before.data.demo,
  true,
  'Smoke test is for an explicit local demo only.',
);
assert.equal(
  before.data.state.tasks.length,
  0,
  'Use a fresh local database for this smoke test.',
);
const bytes = new Uint8Array(32044),
  view = new DataView(bytes.buffer);
const write = (s, i) => bytes.set(new TextEncoder().encode(s), i);
write('RIFF', 0);
view.setUint32(4, bytes.length - 8, true);
write('WAVEfmt ', 8);
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, 16000, true);
view.setUint32(28, 32000, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
write('data', 36);
view.setUint32(40, 32000, true);
const form = new FormData();
form.set(
  'audio',
  new Blob([bytes], { type: 'audio/wav' }),
  'TEST ONLY - silent audio fixture.wav',
);
form.set(
  'qualityChecks',
  JSON.stringify([
    'quiet',
    'pace',
    'distance',
    'clarity',
    'complete',
    'playback',
  ]),
);
const submitted = await fetch(`${base}/api/workspace`, {
  method: 'POST',
  headers: { 'x-demo-role': 'contributor' },
  body: form,
});
assert.equal(submitted.status, 201);
const { id } = await submitted.json();
const contenders = await Promise.all(
  ['qa', 'admin'].map((role) =>
    request(role, { action: 'claim', kind: 'quick', count: 1 }),
  ),
);
assert.equal(
  contenders.filter((r) => r.data.result.includes(id)).length,
  1,
  'Exactly one reviewer can claim the recording.',
);
const winner = contenders[0].data.result.includes(id) ? 'qa' : 'admin';
assert.equal(
  (await request('contributor', { action: 'openRound' })).status,
  403,
);
assert.equal(
  (await request(winner, { action: 'quick', id, approved: true, note: '' }))
    .status,
  200,
);
assert.equal(
  (await request(winner, { action: 'quick', id, approved: true, note: '' }))
    .status,
  409,
);
assert.equal(
  (
    await request('admin', {
      action: 'transcript',
      id,
      text: '[Silence — automated test fixture]',
    })
  ).status,
  200,
);
for (let round = 1; round <= 3; round++) {
  assert.equal((await request('admin', { action: 'openRound' })).status, 200);
  assert.equal((await request('admin', { action: 'closeRound' })).status, 409);
  await request('qa', { action: 'claim', kind: 'deep', count: 1 });
  assert.equal(
    (
      await request('qa', {
        action: 'deep',
        id,
        text: '[Silence — automated test fixture]',
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('qa', { action: 'deep', id, text: 'duplicate' })).status,
    409,
  );
  assert.equal((await request('admin', { action: 'closeRound' })).status, 200);
}
const after = await request('admin');
assert.equal(after.data.state.tasks[0].status, 'READY_TO_DELIVER');
assert.equal(after.data.state.tasks[0].streak, 3);
const audio = await fetch(`${base}/api/workspace?audio=${id}`);
assert.equal(audio.status, 200);
assert.equal((await audio.arrayBuffer()).byteLength, bytes.length);
const exported = await (await fetch(`${base}/api/workspace?export=1`)).json();
assert.equal(exported.records.length, 1);
assert.equal(exported.records[0].reviews.length, 3);
assert.equal(exported.records[0].audioQuality.criteriaVersion, 1);
const invalid = new FormData();
invalid.set('audio', new Blob(['This is not an audio file.']), 'fake.wav');
assert.equal(
  (
    await fetch(`${base}/api/workspace`, {
      method: 'POST',
      headers: { 'x-demo-role': 'contributor' },
      body: invalid,
    })
  ).status,
  400,
);
assert.equal(
  (
    await fetch(`${base}/api/workspace`, {
      method: 'POST',
      headers: {
        origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'openRound' }),
    })
  ).status,
  403,
);
assert.equal((await fetch(`${base}/api/jobs`, { method: 'POST' })).status, 401);
console.log(
  'PASS: upload, concurrent exclusive claims, role enforcement, duplicate protection, 3 rounds, persisted delivery export, audio retrieval, invalid upload, cross-origin protection and worker authentication.',
);
console.log(
  'One clearly labelled silent test recording remains in the local demo database; it is excluded from Git.',
);
