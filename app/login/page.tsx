import {
  AudioLines,
  ArrowUpRight,
  Mic,
  Headphones,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { portals } from '@/lib/portals';
import type { Role } from '@/lib/workflow';
import './login.css';

export const metadata = { title: 'Choose your workspace · Fieldnote' };
const icons = {
  contributor: Mic,
  qa: Headphones,
  team_leader: UsersRound,
  admin: SlidersHorizontal,
};
export default function Login() {
  return (
    <main className="login-home">
      <a className="login-brand" href="/login">
        <AudioLines aria-hidden="true" /> FIELDNOTE
      </a>
      <div className="login-intro">
        <p className="login-kicker">ONE PROJECT. EVERY VOICE.</p>
        <h1>Welcome to your workspace.</h1>
        <p>Choose your role to sign in and pick up where you left off.</p>
      </div>
      <div className="portal-grid">
        {(Object.keys(portals) as Role[]).map((role, index) => {
          const portal = portals[role];
          const Icon = icons[role];
          return (
            <a
              key={role}
              href={
                role === 'team_leader' ? '/login/team-leader' : `/login/${role}`
              }
              className={`portal-card portal-card-${role}`}
            >
              <div className="portal-card-top">
                <Icon size={30} aria-hidden="true" />
                <span>0{index + 1}</span>
              </div>
              <div>
                <p className="login-kicker">{portal.tag}</p>
                <h2>{portal.name}</h2>
                <p>{portal.description}</p>
              </div>
              <span className="portal-card-link">
                Sign in <ArrowUpRight size={20} aria-hidden="true" />
              </span>
            </a>
          );
        })}
      </div>
      <p className="login-footnote">
        Use the account your workspace administrator has invited.
      </p>
    </main>
  );
}
