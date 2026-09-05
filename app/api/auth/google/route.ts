import { parseRole } from '@/lib/portals';
import { createSupabaseAuthClient } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const portal = parseRole(new URL(request.url).searchParams.get('portal'));
  if (!portal) return Response.redirect(new URL('/login', request.url));
  const failure = new URL(`/login/${portal}`, request.url);
  try {
    const supabase = await createSupabaseAuthClient();
    if (!supabase) {
      failure.searchParams.set('auth', 'unavailable');
      return Response.redirect(failure);
    }
    const callback = new URL('/auth/callback', request.url);
    callback.searchParams.set('portal', portal);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });
    if (error || !data.url) {
      failure.searchParams.set('auth', 'google-error');
      return Response.redirect(failure);
    }
    return Response.redirect(data.url);
  } catch {
    failure.searchParams.set('auth', 'unavailable');
    return Response.redirect(failure);
  }
}
