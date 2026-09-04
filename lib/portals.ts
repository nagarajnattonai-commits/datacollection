import type { Role, State } from './workflow';

export const portals = {
  contributor: {
    name: 'Contributor',
    title: 'Your voice starts here.',
    description: 'Record, upload, and keep track of your contributions.',
    action: 'Open recording studio',
    tag: 'THE RECORDING STUDIO',
    steps: [
      'Record or upload audio',
      'Follow your review progress',
      'See feedback and submit retakes',
    ],
  },
  qa: {
    name: 'QA Reviewer',
    title: 'A careful ear. A better dataset.',
    description:
      'Listen closely, refine transcripts, and help every recording meet the standard.',
    action: 'Open review desk',
    tag: 'THE REVIEW DESK',
    steps: [
      'Check audio in Quick Review',
      'Refine transcripts in Deep Review',
      'Submit each review with confidence',
    ],
  },
  admin: {
    name: 'Administrator / Team Leader',
    title: 'Bring the whole project together.',
    description:
      'Manage your team, guide review rounds, and prepare approved recordings for delivery.',
    action: 'Open project management',
    tag: 'PROJECT CONTROL',
    steps: [
      'Manage team access',
      'Coordinate review rounds',
      'Prepare final delivery',
    ],
  },
} satisfies Record<
  Role,
  {
    name: string;
    title: string;
    description: string;
    action: string;
    tag: string;
    steps: string[];
  }
>;

export function parseRole(value: unknown): Role | null {
  return value === 'contributor' || value === 'qa' || value === 'admin'
    ? value
    : null;
}

export function assignedRole(
  email: string,
  adminEmail: string | undefined,
  members: State['members'],
): Role | null {
  const normalized = email.trim().toLowerCase();
  if (adminEmail && normalized === adminEmail.trim().toLowerCase())
    return 'admin';
  return (
    members.find((member) => member.email.toLowerCase() === normalized)?.role ??
    null
  );
}

export function workspaceAccess(
  demo: boolean,
  assigned: Role | null,
  requested: Role | null,
): { role: Role } | { redirect: string } {
  if (demo) return requested ? { role: requested } : { redirect: '/login' };
  if (!assigned || (requested && requested !== assigned))
    return { redirect: requested ? `/login/${requested}` : '/login' };
  return { role: assigned };
}
