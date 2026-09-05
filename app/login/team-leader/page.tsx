import RoleLogin from '@/components/role-login';

export const metadata = { title: 'Team Leader login · Fieldnote' };
export default function Page() {
  return <RoleLogin role="team_leader" />;
}
