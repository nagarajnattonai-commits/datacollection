import RoleLogin from '@/components/role-login';
export const metadata = { title: 'Administrator login · Fieldnote' };
export default function Page() {
  return <RoleLogin role="admin" />;
}
