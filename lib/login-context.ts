import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { localDemo } from './auth';
import { assignedRole } from './portals';
import { readState } from './store';

export async function loginContext() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'app.local';
  const demo = localDemo(new Request(`http://${host}/`));
  if (demo) return { demo: true, user: null, role: null } as const;
  const user = await getChatGPTUser();
  const role = user
    ? assignedRole(
        user.email,
        env.ADMIN_EMAIL,
        (await readState()).state.members,
      )
    : null;
  return { demo: false, user, role };
}
