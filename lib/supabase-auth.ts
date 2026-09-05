import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from 'cloudflare:workers';

type AuthEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export function parseSupabaseAuthConfig(values: AuthEnvironment) {
  const url = values.SUPABASE_URL?.trim();
  const publishableKey = values.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey)
    throw new Error(
      'Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to enable authentication.',
    );
  let origin: URL;
  try {
    origin = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL is invalid.');
  }
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
    throw new Error('SUPABASE_URL must use HTTPS.');
  return { url: origin.origin, publishableKey };
}

export function supabaseAuthConfigured() {
  return parseSupabaseAuthConfig(env) !== null;
}

export async function createSupabaseAuthClient() {
  const config = parseSupabaseAuthConfig(env);
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(values) {
        try {
          for (const { name, value, options } of values)
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: !import.meta.env.DEV,
              path: '/',
            });
        } catch {
          // Server-rendered pages cannot always write refreshed cookies. Route
          // handlers perform the actual sign-in, callback, and sign-out writes.
        }
      },
    },
  });
}
