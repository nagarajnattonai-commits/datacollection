import { AudioLines, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import SignupForm from '@/components/signup-form';
import { parseRole } from '@/lib/portals';
import '@/app/login/login.css';

export const metadata = { title: 'Create account · Fieldnote' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string | string[] }>;
}) {
  const query = await searchParams;
  const portal = parseRole(query.portal) ?? 'contributor';
  return (
    <main className="signup-page">
      <section className="signup-shell">
        <Link className="login-brand" href="/login">
          <AudioLines aria-hidden="true" /> FIELDNOTE
        </Link>
        <Link className="signup-back" href={`/login/${portal}`}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to login
        </Link>
        <div className="signup-heading">
          <p className="login-kicker">CREATE YOUR ACCOUNT</p>
          <h1>Join the collection.</h1>
          <p>
            Add your basic details and choose the workspace you need. Your
            administrator controls final role access.
          </p>
        </div>
        <SignupForm initialRole={portal} />
      </section>
    </main>
  );
}
