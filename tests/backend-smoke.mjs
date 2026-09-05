import assert from 'node:assert/strict';

const base = process.env.APP_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('Only run this check against a local website.');

const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.match(health.headers.get('x-request-id') ?? '', /^[A-Za-z0-9_-]+$/);
assert.deepEqual((await health.json()).checks, {
  database: 'ok',
  objectStorage: 'ok',
});

const denied = await fetch(`${base}/api/metrics`, {
  headers: { 'x-demo-role': 'contributor' },
});
assert.equal(denied.status, 403);
const leaderMetrics = await fetch(`${base}/api/metrics`, {
  headers: { 'x-demo-role': 'team_leader' },
});
assert.equal(leaderMetrics.status, 403);
const leaderWorkspace = await fetch(`${base}/api/workspace`, {
  headers: { 'x-demo-role': 'team_leader' },
});
assert.equal(leaderWorkspace.status, 200);
assert.equal((await leaderWorkspace.json()).actor.role, 'team_leader');
const leaderAccessChange = await fetch(`${base}/api/workspace`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: base,
    'x-demo-role': 'team_leader',
  },
  body: JSON.stringify({
    action: 'member',
    email: 'permission-check@example.com',
    role: 'contributor',
  }),
});
assert.equal(leaderAccessChange.status, 403);
const metrics = await fetch(`${base}/api/metrics`, {
  headers: { 'x-demo-role': 'admin' },
});
assert.equal(metrics.status, 200);
const body = await metrics.json();
assert.equal(typeof body.tasks.total, 'number');
assert.equal(typeof body.tasks.transcriptionBacklog, 'number');
assert.equal(typeof body.team.total, 'number');

console.log(
  'Backend health, storage checks, administrator metrics and Team Leader access boundaries passed. No workspace data changed.',
);
