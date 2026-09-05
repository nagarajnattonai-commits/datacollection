import { parseRole } from '@/lib/portals';
import { createSupabaseAuthClient } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const portal = parseRole(url.searchParams.get('portal')) ?? 'contributor';
  const login = new URL(`/login/${portal}`, request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    login.searchParams.set('auth', 'callback-error');
    return Response.redirect(login);
  }
  try {
    const supabase = await createSupabaseAuthClient();
    if (!supabase) {
      login.searchParams.set('auth', 'unavailable');
      return Response.redirect(login);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      login.searchParams.set('auth', 'callback-error');
      return Response.redirect(login);
    }
    return Response.redirect(
      new URL(`/workspace?portal=${portal}`, request.url),
    );
  } catch {
    login.searchParams.set('auth', 'callback-error');
    return Response.redirect(login);
  }
}
