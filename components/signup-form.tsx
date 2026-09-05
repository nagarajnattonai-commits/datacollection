'use client';

import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { validateSignupInput } from '@/lib/auth-validation';
import { portals } from '@/lib/portals';
import type { Role } from '@/lib/workflow';

export default function SignupForm({ initialRole }: { initialRole: Role }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [portal, setPortal] = useState<Role>(initialRole);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const input = validateSignupInput({
        fullName,
        email,
        password,
        confirmPassword,
        portal,
      });
      setPending(true);
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, confirmPassword }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        redirect?: string;
      };
      if (!response.ok) throw new Error(result.error || 'Unable to sign up.');
      if (result.redirect) return window.location.assign(result.redirect);
      setSuccess(result.message || 'Check your email to confirm your account.');
      setPending(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign up.');
      setPending(false);
    }
  }

  return (
    <form className="signup-form" onSubmit={submit} noValidate>
      <label className="auth-field">
        <span>Full name</span>
        <input
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Your full name"
          required
          maxLength={100}
        />
      </label>
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            required
            minLength={8}
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
        <small>8+ characters with uppercase, lowercase, and a number.</small>
      </label>
      <label className="auth-field">
        <span>Confirm password</span>
        <input
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Enter the password again"
          required
          maxLength={128}
        />
      </label>
      <label className="auth-field">
        <span>Requested portal</span>
        <select
          name="portal"
          value={portal}
          onChange={(event) => setPortal(event.target.value as Role)}
        >
          {Object.entries(portals).map(([value, item]) => (
            <option value={value} key={value}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {portal !== 'contributor' && (
        <p className="auth-role-note">
          An administrator must approve {portals[portal].name} access before
          this account can open that workspace.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {success && <output className="auth-success">{success}</output>}
      <button
        className="login-button auth-submit"
        disabled={pending || !!success}
      >
        {pending ? 'Creating account…' : 'Create account'}
        {!pending && !success && <ArrowRight size={18} aria-hidden="true" />}
      </button>
      <p className="auth-signup-link">
        Already have an account? <a href={`/login/${portal}`}>Log in</a>
      </p>
    </form>
  );
}
