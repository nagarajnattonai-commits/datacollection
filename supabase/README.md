# Supabase PostgreSQL setup

The migrations in `migrations/` create the Fieldnote PostgreSQL source-of-truth table, a private signup-profile table, an atomic compare-and-swap function, secured operational views, indexes, and least-privilege grants. Signup profile data is copied from Supabase Auth metadata into `fieldnote_profiles`; its requested role is informational and never grants workspace access.

1. Create or select a Supabase project.
2. Link this repository with the Supabase CLI.
3. Apply committed migrations with `supabase db push`.
4. Copy the project's publishable key and create a dedicated server secret key in the Supabase Dashboard.
5. Enable Email authentication and, if needed, Google authentication. Add the website's `/auth/callback` URL to the Supabase redirect allow list and configure the Google OAuth client through Supabase.
6. Configure the website environment with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_PROVIDER=supabase`, `SUPABASE_SECRET_KEY`, and `SUPABASE_WORKSPACE_ID=main`.
7. Restart the local server or publish a new website version, then call `/api/health`. It must report `databaseProvider: supabase-postgresql`.

The publishable key is used only for Supabase Auth. The secret key bypasses Row Level Security and must stay server-only. It is never prefixed with `NEXT_PUBLIC_`, returned by an API, logged, or committed. Public and authenticated database roles have no grants on the Fieldnote table, views, or transactional function. Every application operation passes the server's role checks before PostgreSQL is called.

Audio remains in private object storage. PostgreSQL stores its object key, format, byte size, checksum, quality confirmations, workflow state, transcripts, reviews and audit history.
