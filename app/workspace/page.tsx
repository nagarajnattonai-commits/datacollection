import { redirect } from 'next/navigation';
import { accountSignOutPath } from '@/app/chatgpt-auth';
import { loginContext } from '@/lib/login-context';
import { parseRole, workspaceAccess } from '@/lib/portals';
import type { Role } from '@/lib/workflow';
import Workspace from './workspace-client';

export const metadata = { title: 'Workspace · Fieldnote' };
async function ProtectedWorkspace({ portal }: { portal: Role | null }) {
  const { demo, role } = await loginContext();
  const access = workspaceAccess(demo, role, portal);
  if ('redirect' in access) redirect(access.redirect);
  return (
    <Workspace
      initialRole={access.role}
      signOutUrl={demo ? '/login' : accountSignOutPath('/login')}
    />
  );
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string | string[] }>;
}) {
  const query = await searchParams;
  return <ProtectedWorkspace portal={parseRole(query.portal)} />;
}
