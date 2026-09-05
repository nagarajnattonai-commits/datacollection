import { apiJson, enforceRateLimit, requestId } from '@/lib/api';
import { checkOrigin } from '@/lib/auth';
import { validateSignupInput } from '@/lib/auth-validation';
import { createSupabaseAuthClient } from '@/lib/supabase-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    checkOrigin(request);
    enforceRateLimit(request, 'auth-signup', 6, 60 * 60_000);
    if (Number(request.headers.get('content-length')) > 12_000)
      return apiJson({ error: 'Invalid form submission.' }, 400, id);
    const input = validateSignupInput(await request.json());
    const supabase = await createSupabaseAuthClient();
    if (!supabase)
      return apiJson(
        { error: 'Account signup is not configured yet.' },
        503,
        id,
      );
    const callback = new URL('/auth/callback', request.url);
    callback.searchParams.set('portal', input.portal);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: callback.toString(),
        data: {
          full_name: input.fullName,
          phone: input.phone,
          occupation: input.occupation,
          work_details: input.workDetails,
          organization: input.organization,
          city: input.city,
          country: input.country,
          requested_role: input.portal,
        },
      },
    });
    if (error) return apiJson({ error: error.message }, 400, id);
    return apiJson(
      data.session
        ? { ok: true, redirect: `/workspace?portal=${input.portal}` }
        : {
            ok: true,
            confirmationRequired: true,
            message: 'Check your email to confirm your account.',
          },
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
        error:
          error instanceof Error ? error.message : 'Unable to create account.',
      },
      status >= 400 && status < 500 ? status : 500,
      id,
    );
  }
}
