import { createSupabaseAuthClient } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get('return_to'));
  const supabase = await createSupabaseAuthClient();
  if (supabase) await supabase.auth.signOut();
  return Response.redirect(new URL(returnTo, request.url));
}

function safeReturnPath(value: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/login';
  try {
    const parsed = new URL(value, 'https://app.local');
    return parsed.origin === 'https://app.local'
      ? `${parsed.pathname}${parsed.search}`
      : '/login';
  } catch {
    return '/login';
  }
}
