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
  team_leader: {
    name: 'Team Leader',
    title: 'Guide every recording forward.',
    description:
      'Coordinate reviews, manage transcription, and prepare completed recordings for delivery.',
    action: 'Open team operations',
    tag: 'TEAM OPERATIONS',
    steps: [
      'Coordinate review rounds',
      'Manage transcripts and settings',
      'Prepare approved delivery records',
    ],
  },
  admin: {
    name: 'Administrator',
    title: 'Secure the whole project.',
    description:
      'Control team access, oversee operations, and monitor the complete collection.',
    action: 'Open project management',
    tag: 'PROJECT CONTROL',
    steps: [
      'Manage every team role',
      'Oversee project operations',
      'Review metrics and delivery',
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
  return value === 'contributor' ||
    value === 'qa' ||
    value === 'team_leader' ||
    value === 'admin'
    ? value
    : null;
}

export function portalLoginPath(role: Role) {
  return `/login/${role === 'team_leader' ? 'team-leader' : role}`;
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
    return { redirect: requested ? portalLoginPath(requested) : '/login' };
  return { role: assigned };
}
