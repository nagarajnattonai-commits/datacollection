import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { checkOrigin } from '@/lib/auth';
import { validateLoginInput } from '@/lib/auth-validation';
import { createSupabaseAuthClient } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    checkOrigin(request);
    enforceRateLimit(request, 'auth-login', 12, 10 * 60_000);
    if (Number(request.headers.get('content-length')) > 10_000)
      return apiJson({ error: 'Invalid form submission.' }, 400, id);
    const input = validateLoginInput(await request.json());
    const supabase = await createSupabaseAuthClient();
    if (!supabase)
      return apiJson(
        { error: 'Account login is not configured yet.' },
        503,
        id,
      );
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error)
      return apiJson({ error: 'Email or password is incorrect.' }, 401, id);
    return apiJson(
      { ok: true, redirect: `/workspace?portal=${input.portal}` },
      200,
      id,
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return apiJson({ error: 'Invalid form submission.' }, 400, id);
    const status =
      error instanceof Error && 'status' in error ? Number(error.status) : 400;
    return apiJson(
      {
        error: error instanceof Error ? error.message : 'Unable to sign in.',
      },
      status >= 400 && status < 500 ? status : 500,
      id,
    );
  }
}
