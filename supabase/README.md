# Supabase PostgreSQL setup

The migration in `migrations/` creates the Fieldnote PostgreSQL source-of-truth table, an atomic compare-and-swap function, secured operational views, indexes, and least-privilege grants.

1. Create or select a Supabase project.
2. Link this repository with the Supabase CLI.
3. Apply committed migrations with `supabase db push`.
4. Create a dedicated server secret key in the Supabase Dashboard.
5. Configure the website's private server environment with `DATABASE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_WORKSPACE_ID=main`.
6. Restart the local server or publish a new website version, then call `/api/health`. It must report `databaseProvider: supabase-postgresql`.

The secret key bypasses Row Level Security and must stay server-only. It is never prefixed with `NEXT_PUBLIC_`, returned by an API, logged, or committed. Public and authenticated database roles have no grants on the Fieldnote table, views, or transactional function. Application users continue to authenticate through the website and every operation passes the server's role checks before PostgreSQL is called.

Audio remains in private object storage. PostgreSQL stores its object key, format, byte size, checksum, quality confirmations, workflow state, transcripts, reviews and audit history.
