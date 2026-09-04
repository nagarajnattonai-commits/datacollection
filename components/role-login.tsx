import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  Headphones,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { loginContext } from '@/lib/login-context';
import { portals } from '@/lib/portals';
import type { Role } from '@/lib/workflow';
import '@/app/login/login.css';

const icons = { contributor: Mic, qa: Headphones, admin: ShieldCheck };
export default async function RoleLogin({ role }: { role: Role }) {
  const portal = portals[role];
  const { demo, user, role: assigned } = await loginContext();
  const Icon = icons[role];
  const destination = `/workspace?portal=${role}`;
  const mismatch = user && assigned && assigned !== role;
  return (
    <main className={`role-login role-login-${role}`}>
      <section className="role-story">
        <a className="login-brand" href="/login">
          <AudioLines aria-hidden="true" /> FIELDNOTE
        </a>
        <div className="role-story-body">
          <p className="login-kicker">{portal.tag}</p>
          <h1>{portal.title}</h1>
          <p>{portal.description}</p>
          <ol className="role-steps">
            {portal.steps.map((step, i) => (
              <li key={step}>
                <span>0{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <p className="role-story-footer">
          FIELDNOTE / AUDIO COLLECTION WORKSPACE
        </p>
      </section>
      <section className="role-entry" aria-label={`${portal.name} sign in`}>
        <a href="/login">
          <ArrowLeft size={16} aria-hidden="true" /> All login options
        </a>
        <div className="login-panel">
          <span className="login-emblem">
            <Icon size={26} aria-hidden="true" />
          </span>
          <h2>{portal.name} login</h2>
          <p>
            {role === 'contributor'
              ? 'Ready for your next recording? Sign in to get started.'
              : role === 'qa'
                ? 'Your next review starts with a fresh listen. Sign in to your review desk.'
                : 'Sign in to manage your team and keep your collection moving.'}
          </p>
          {demo ? (
            <>
              <div className="login-demo">
                <strong>Local demo</strong>
                <br />
                Try this role using sample access on this computer.
              </div>
              <a className="login-button" href={destination}>
                Try{' '}
                {role === 'admin' ? 'administrator' : portal.name.toLowerCase()}{' '}
                demo <ArrowRight size={18} aria-hidden="true" />
              </a>
            </>
          ) : !user ? (
            <>
              <a
                className="login-button"
                href={chatGPTSignInPath(destination)}
                target="_top"
              >
                Sign in with ChatGPT <ArrowRight size={18} aria-hidden="true" />
              </a>
              <p className="login-caption">
                Continue with the email your administrator added to the team.
              </p>
            </>
          ) : (
            <>
              <div className="login-identity">
                <strong>Signed in as</strong>
                {user.email}
              </div>
              {!assigned ? (
                <div role="status">
                  <p>
                    Your account has not been added to this workspace. Ask the
                    administrator to invite this email.
                  </p>
                </div>
              ) : mismatch ? (
                <>
                  <p role="status">
                    Your account has {portals[assigned].name} access. Continue
                    through your assigned portal.
                  </p>
                  <a className="login-button" href={`/login/${assigned}`}>
                    Go to your portal{' '}
                    <ArrowRight size={18} aria-hidden="true" />
                  </a>
                </>
              ) : (
                <a className="login-button" href={destination}>
                  {portal.action} <ArrowRight size={18} aria-hidden="true" />
                </a>
              )}
              <a
                className="login-switch"
                href={chatGPTSignOutPath(`/login/${role}`)}
                target="_top"
              >
                Sign out or switch account
              </a>
            </>
          )}
          <p className="login-caption">
            Need a different role? Your workspace administrator can update your
            access.
          </p>
        </div>
        <p className="login-footnote">Your workspace. Your assigned access.</p>
      </section>
    </main>
  );
}
