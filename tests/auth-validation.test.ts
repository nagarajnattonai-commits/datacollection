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
      phone: '+91 98765 43210',
      occupation: 'professional',
      workDetails: 'Data analyst',
      organization: 'Fieldnote Labs',
      city: 'Chennai',
      country: 'India',
      password: 'Secure123',
      confirmPassword: 'Secure123',
      portal: 'contributor',
    }),
    {
      fullName: 'Priya Kumar',
      email: 'priya@example.com',
      phone: '+919876543210',
      occupation: 'professional',
      workDetails: 'Data analyst',
      organization: 'Fieldnote Labs',
      city: 'Chennai',
      country: 'India',
      password: 'Secure123',
      portal: 'contributor',
    },
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'P',
      email: 'p@example.com',
      phone: '+919876543210',
      occupation: 'homemaker',
      workDetails: '',
      organization: '',
      city: 'Chennai',
      country: 'India',
      password: 'Secure123',
      confirmPassword: 'Secure123',
      portal: 'contributor',
    }),
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'Priya Kumar',
      email: 'p@example.com',
      phone: '+919876543210',
      occupation: 'homemaker',
      workDetails: '',
      organization: '',
      city: 'Chennai',
      country: 'India',
      password: 'weak',
      confirmPassword: 'weak',
      portal: 'contributor',
    }),
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'Priya Kumar',
      email: 'p@example.com',
      phone: '+919876543210',
      occupation: 'homemaker',
      workDetails: '',
      organization: '',
      city: 'Chennai',
      country: 'India',
      password: 'Secure123',
      confirmPassword: 'Secure124',
      portal: 'admin',
    }),
  );
  assert.throws(() =>
    validateSignupInput({
      fullName: 'Priya Kumar',
      email: 'p@example.com',
      phone: '123',
      occupation: 'professional',
      workDetails: '',
      organization: '',
      city: '',
      country: 'India',
      password: 'Secure123',
      confirmPassword: 'Secure123',
      portal: 'team_leader',
    }),
  );
});
