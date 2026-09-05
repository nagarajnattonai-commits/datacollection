import { parseRole } from './portals.ts';
import type { Role } from './workflow.ts';

export type LoginInput = {
  email: string;
  password: string;
  portal: Role;
};

export type SignupInput = LoginInput & {
  fullName: string;
  phone: string;
  occupation: Occupation;
  workDetails: string;
  organization: string;
  city: string;
  country: string;
};

export const occupationOptions = [
  { value: 'homemaker', label: 'Homemaker / housewife' },
  { value: 'professional', label: 'Working professional' },
  { value: 'self_employed', label: 'Self-employed / business owner' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
] as const;

export type Occupation = (typeof occupationOptions)[number]['value'];

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
  const phone = phoneInput(input.phone);
  const password = passwordInput(input.password, true);
  if (password !== input.confirmPassword)
    throw new Error('Passwords do not match.');
  const portal = parseRole(input.portal);
  if (!portal) throw new Error('Choose a valid portal.');
  const occupation = occupationInput(input.occupation);
  const workDetails = boundedText(input.workDetails, 100);
  const organization = boundedText(input.organization, 120);
  const city = requiredText(input.city, 80, 'Enter your city.');
  const country = requiredText(
    input.country,
    80,
    'Enter your country or region.',
  );
  if (
    ['professional', 'self_employed', 'student'].includes(occupation) &&
    !workDetails
  )
    throw new Error('Enter your job title, field of work, or course.');
  return {
    fullName,
    email,
    phone,
    password,
    portal,
    occupation,
    workDetails,
    organization,
    city,
    country,
  };
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

function phoneInput(value: unknown) {
  const phone = textInput(value);
  const digits = phone.replace(/\D/g, '');
  if (
    !/^\+?[0-9()\-\s]{8,25}$/.test(phone) ||
    digits.length < 8 ||
    digits.length > 15
  )
    throw new Error('Enter a valid phone number with country code.');
  return `${phone.startsWith('+') ? '+' : ''}${digits}`;
}

function occupationInput(value: unknown): Occupation {
  if (occupationOptions.some((option) => option.value === value))
    return value as Occupation;
  throw new Error('Choose your occupation or current status.');
}

function boundedText(value: unknown, max: number) {
  const text = textInput(value).replace(/\s+/g, ' ');
  if (text.length > max) throw new Error('One of the details is too long.');
  return text;
}

function requiredText(value: unknown, max: number, message: string) {
  const text = boundedText(value, max);
  if (!text) throw new Error(message);
  return text;
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid form submission.');
  return value as Record<string, unknown>;
}
