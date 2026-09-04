import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedRole, parseRole, workspaceAccess } from '../lib/portals.ts';
import type { Role } from '../lib/workflow.ts';

const roles: Role[] = ['contributor', 'qa', 'admin'];
test('portal parameters accept only exact known roles', () => {
  for (const role of roles) assert.equal(parseRole(role), role);
  for (const value of [
    null,
    undefined,
    '',
    'administrator',
    '__proto__',
    ['admin'],
    '/admin',
  ])
    assert.equal(parseRole(value), null);
});
test('membership resolves by email and only the configured owner bootstraps admin', () => {
  const members = [{ email: 'Reviewer@Example.com', role: 'qa' as const }];
  assert.equal(
    assignedRole('OWNER@example.com', 'owner@example.com', members),
    'admin',
  );
  assert.equal(assignedRole('reviewer@example.com', undefined, members), 'qa');
  assert.equal(
    assignedRole('outsider@example.com', 'owner@example.com', members),
    null,
  );
});
test('every production role is checked against every requested portal', () => {
  for (const actual of roles) {
    assert.deepEqual(workspaceAccess(false, actual, null), { role: actual });
    for (const requested of roles)
      assert.deepEqual(
        workspaceAccess(false, actual, requested),
        actual === requested
          ? { role: actual }
          : { redirect: `/login/${requested}` },
      );
  }
});
test('unsigned and unassigned accounts cannot enter a production workspace', () => {
  for (const role of roles)
    assert.deepEqual(workspaceAccess(false, null, role), {
      redirect: `/login/${role}`,
    });
  assert.deepEqual(workspaceAccess(false, null, null), { redirect: '/login' });
});
test('local demo requires an explicit portal choice', () => {
  assert.deepEqual(workspaceAccess(true, null, null), { redirect: '/login' });
  for (const role of roles)
    assert.deepEqual(workspaceAccess(true, null, role), { role });
});
