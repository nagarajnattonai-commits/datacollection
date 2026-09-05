import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Headphones,
  Mic,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { accountSignOutPath } from '@/app/chatgpt-auth';
import AuthForm from '@/components/auth-form';
import { loginContext } from '@/lib/login-context';
import { portalLoginPath, portals } from '@/lib/portals';
import { audioCriteria } from '@/lib/audio-criteria';
import type { Role } from '@/lib/workflow';
import '@/app/login/login.css';

const icons = {
  contributor: Mic,
  qa: Headphones,
  team_leader: UsersRound,
  admin: ShieldCheck,
};
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
          {role === 'contributor' && (
            <div className="login-quality">
              <strong>Before you record</strong>
              <ul>
                {audioCriteria.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <CircleCheck size={17} aria-hidden="true" />
                    {item.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                : role === 'team_leader'
                  ? 'Sign in to coordinate reviews and move the collection forward.'
                  : 'Sign in to manage access and oversee the collection.'}
          </p>
          {!user ? (
            <>
              <AuthForm role={role} />
              {demo && (
                <div className="demo-access">
                  <div className="auth-divider" aria-hidden="true">
                    <span>local testing</span>
                  </div>
                  <div className="login-demo">
                    <strong>Local demo</strong>
                    <br />
                    Try this role using sample access on this computer.
                  </div>
                  <a className="login-button" href={destination}>
                    Try{' '}
                    {role === 'admin'
                      ? 'administrator'
                      : role === 'team_leader'
                        ? 'team leader'
                        : portal.name.toLowerCase()}{' '}
                    demo <ArrowRight size={18} aria-hidden="true" />
                  </a>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="login-identity">
                <strong>Signed in as</strong>
                {user.email}
              </div>
              {!assigned ? (
                <output className="login-status">
                  Your account has not been added to this workspace. Ask the
                  administrator to invite this email.
                </output>
              ) : mismatch ? (
                <>
                  <output className="login-status">
                    Your account has {portals[assigned].name} access. Continue
                    through your assigned portal.
                  </output>
                  <a className="login-button" href={portalLoginPath(assigned)}>
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
                href={accountSignOutPath(portalLoginPath(role))}
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
