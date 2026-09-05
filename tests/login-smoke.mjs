import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('Only run this check on localhost.');
for (const [role, heading] of [
  ['contributor', 'Contributor login'],
  ['qa', 'QA Reviewer login'],
  ['team_leader', 'Team Leader login'],
  ['admin', 'Administrator login'],
]) {
  const loginPath = role === 'team_leader' ? 'team-leader' : role;
  const response = await fetch(`${base}/login/${loginPath}`);
  assert.equal(response.status, 200);
  const body = (await response.text()).replace(/<!--.*?-->/gs, '');
  assert.ok(body.includes(heading), `Missing heading for ${role}`);
  assert.ok(body.includes(`role-login-${role}`), `Missing design for ${role}`);
  assert.ok(body.includes('Email address'), `Missing email field for ${role}`);
  assert.ok(body.includes('Password'), `Missing password field for ${role}`);
  assert.ok(
    body.includes('Continue with Google'),
    `Missing Google login for ${role}`,
  );
  assert.ok(
    body.includes('/signup?portal='),
    `Missing signup link for ${role}`,
  );
  assert.ok(
    body.includes(`/workspace?portal=${role}`),
    `Missing entry for ${role}`,
  );
  const workspace = await fetch(`${base}/workspace?portal=${role}`);
  assert.equal(workspace.status, 200);
  const workspaceBody = await workspace.text();
  assert.ok(
    workspaceBody.includes(`\\"initialRole\\":\\"${role}\\"`),
    `Workspace must receive the ${role} role`,
  );
}
const signup = await fetch(`${base}/signup?portal=qa`);
assert.equal(signup.status, 200);
const signupBody = await signup.text();
for (const expected of [
  'Full name',
  'Email address',
  'Phone number',
  'Occupation / current status',
  'City',
  'Country or region',
  'Password',
  'Confirm password',
  'Requested portal',
])
  assert.ok(signupBody.includes(expected), `Signup is missing ${expected}`);
for (const path of ['/workspace', '/workspace?portal=invalid']) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  const body = await response.text();
  assert.ok(
    (response.status >= 300 &&
      response.status < 400 &&
      response.headers.get('location') === '/login') ||
      body.includes('url=/login'),
    `${path} should redirect to login`,
  );
}
console.log(
  'Four login pages, expanded signup fields, workspace entries, and invalid portal redirects passed. No workspace data changed.',
);
