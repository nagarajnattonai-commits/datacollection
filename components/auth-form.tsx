'use client';

import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { validateLoginInput } from '@/lib/auth-validation';
import { portals } from '@/lib/portals';
import type { Role } from '@/lib/workflow';

export default function AuthForm({ role }: { role: Role }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(() => initialAuthError());

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const input = validateLoginInput({ email, password, portal: role });
      setPending(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = (await response.json()) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok || !result.redirect)
        throw new Error(result.error || 'Unable to sign in.');
      window.location.assign(result.redirect);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
      setPending(false);
    }
  }

  return (
    <div className="auth-options">
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span>Email address</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            maxLength={254}
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <span className="auth-password">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="login-button auth-submit" disabled={pending}>
          {pending ? 'Signing in…' : `Log in as ${portals[role].name}`}
          {!pending && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>
      <div className="auth-divider" aria-hidden="true">
        <span>or</span>
      </div>
      <a className="google-button" href={`/api/auth/google?portal=${role}`}>
        <span className="google-mark" aria-hidden="true">
          G
        </span>
        Continue with Google
      </a>
      <p className="auth-signup-link">
        New to Fieldnote?{' '}
        <a href={`/signup?portal=${role}`}>Create an account</a>
      </p>
    </div>
  );
}

function initialAuthError() {
  if (typeof window === 'undefined') return '';
  const reason = new URLSearchParams(window.location.search).get('auth');
  if (reason === 'unavailable')
    return 'Account login has not been connected yet.';
  if (reason === 'google-error')
    return 'Google sign-in could not start. Please try again.';
  if (reason === 'callback-error')
    return 'Sign-in confirmation failed or expired. Please try again.';
  return '';
}
