import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLoginInput,
  validateSignupInput,
} from '../lib/auth-validation.ts';

void test('login validation normalizes email and preserves the password', () => {
  assert.deepEqual(
    validateLoginInput({
      email: ' Person@Example.COM ',
      password: 'password value',
      portal: 'qa',
    }),
    {
      email: 'person@example.com',
      password: 'password value',
      portal: 'qa',
    },
  );
  assert.throws(() =>
    validateLoginInput({ email: 'not-an-email', password: 'x', portal: 'qa' }),
  );
  assert.throws(() =>
    validateLoginInput({ email: 'a@example.com', password: '', portal: 'qa' }),
  );
});

void test('signup requires basic details, matching strong passwords and a role', () => {
  assert.deepEqual(
    validateSignupInput({
      fullName: '  Priya   Kumar ',
      email: 'PRIYA@example.com',
      password: 'Secure123',
      confirmPassword: 'Secure123',
      portal: 'contributor',
    }),
    {
      fullName: 'Priya Kumar',
      email: 'priya@example.com',
      password: 'Secure123',
      portal: 'contributor',
    },
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'P',
      email: 'p@example.com',
      password: 'Secure123',
      confirmPassword: 'Secure123',
      portal: 'contributor',
    }),
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'Priya Kumar',
      email: 'p@example.com',
      password: 'weak',
      confirmPassword: 'weak',
      portal: 'contributor',
    }),
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'Priya Kumar',
      email: 'p@example.com',
      password: 'Secure123',
      confirmPassword: 'Secure124',
      portal: 'admin',
    }),
  );
});
