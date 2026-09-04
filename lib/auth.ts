import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { WorkflowError, type Actor, type State, type Role } from './workflow';
import { assignedRole } from './portals';
export function localDemo(request: Request) {
  return (
    import.meta.env.DEV &&
    env.LOCAL_DEMO === 'true' &&
    ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)
  );
}
export async function actorFor(request: Request, state: State): Promise<Actor> {
  if (localDemo(request)) {
    const role = request.headers.get('x-demo-role') ?? 'admin';
    if (!['admin', 'qa', 'contributor'].includes(role))
      throw new WorkflowError('Unknown demo role.', 400);
    return {
      id: `demo-${role}`,
      email: `${role}@local.test`,
      role: role as Role,
    };
  }
  const user = await getChatGPTUser();
  if (!user) throw new WorkflowError('Sign in to access this workspace.', 401);
  const email = user.email.toLowerCase();
  const role = assignedRole(email, env.ADMIN_EMAIL, state.members);
  if (!role)
    throw new WorkflowError(
      'Ask the workspace administrator to add your email to the team.',
      403,
    );
  return { id: user.userId, email, role };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new WorkflowError('Cross-origin requests are not allowed.', 403);
}
