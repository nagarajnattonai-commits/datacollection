import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('Only run this check on localhost.');
for (const [role, heading] of [
  ['contributor', 'Contributor login'],
  ['qa', 'QA Reviewer login'],
  ['admin', 'Administrator / Team Leader login'],
]) {
  const response = await fetch(`${base}/login/${role}`);
  assert.equal(response.status, 200);
  const body = (await response.text()).replace(/<!--.*?-->/gs, '');
  assert.ok(body.includes(heading), `Missing heading for ${role}`);
  assert.ok(body.includes(`role-login-${role}`), `Missing design for ${role}`);
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
  'Three login pages, workspace entries, and invalid portal redirects passed. No workspace data changed.',
);
