import { parseRole } from './portals.ts';
import type { Role } from './workflow.ts';

export type LoginInput = {
  email: string;
  password: string;
  portal: Role;
};

export type SignupInput = LoginInput & {
  fullName: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginInput(value: unknown): LoginInput {
  const input = objectInput(value);
  const email = emailInput(input.email);
  const password = passwordInput(input.password, false);
  const portal = parseRole(input.portal);
  if (!portal) throw new Error('Choose a valid login portal.');
  return { email, password, portal };
}

export function validateSignupInput(value: unknown): SignupInput {
  const input = objectInput(value);
  const fullName = textInput(input.fullName).replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 100)
    throw new Error('Enter your full name.');
  const email = emailInput(input.email);
  const password = passwordInput(input.password, true);
  if (password !== input.confirmPassword)
    throw new Error('Passwords do not match.');
  const portal = parseRole(input.portal);
  if (!portal) throw new Error('Choose a valid portal.');
  return { fullName, email, password, portal };
}

function emailInput(value: unknown) {
  const email = textInput(value).toLowerCase();
  if (email.length > 254 || !emailPattern.test(email))
    throw new Error('Enter a valid email address.');
  return email;
}

function passwordInput(value: unknown, enforceStrength: boolean) {
  if (typeof value !== 'string' || value.length > 128)
    throw new Error('Enter a valid password.');
  if (!enforceStrength) {
    if (!value) throw new Error('Enter your password.');
    return value;
  }
  if (
    value.length < 8 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value)
  )
    throw new Error(
      'Use at least 8 characters with uppercase, lowercase, and a number.',
    );
  return value;
}

function textInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid form submission.');
  return value as Record<string, unknown>;
}
