# Fieldnote — Audio collection MVP

A working pilot of the workflow in the three supplied architecture documents: record or upload audio, Quick Review, queued transcription, controlled Deep Review rounds, and final delivery records.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev -- --host 127.0.0.1
```

On Windows, use `Copy-Item .dev.vars.example .dev.vars` instead of `cp`. Open the localhost address printed by the server. Local D1 records and R2 audio persist under `.wrangler/`, which is excluded from Git. Restart the server after changing `.dev.vars`. Local D1 remains the offline test database; configure Supabase below to use PostgreSQL.

The example enables **local demo login portals**. They are active only in a development build, on localhost, with `LOCAL_DEMO=true`. Production builds ignore demo access and require an authenticated, authorized account. Open `/login` and choose a portal. Use **Change portal** to switch roles in the local demo.

## Try the complete workflow

1. Select **Contributor**. Read the project brief and prompt, record or upload audio, and wait for the browser to check its format, duration and sound level. Play the recording, complete the project-driven intake fields and six quality checks, accept consent, then submit. A rejected item has a **Redo** action; its replacement keeps the same task and retains earlier attempts and reviewer feedback.
2. Select **QA reviewer**, open **Quick Review**, claim a batch, listen, then approve or request a retake with feedback. Reviewers cannot claim their own submissions.
3. Select **Team Leader** and open **Manage project**. With the default manual provider, import the real transcript for approved audio. Manual imports are labelled and do not pretend to be machine transcription. Administrators can perform the same project operations and are the only role that can manage team access.
4. Open a Deep Review round. Switch to **QA reviewer**, claim a batch, listen, edit if necessary, and submit.
5. The administrator can close the round only after every included recording is reviewed. Each unchanged transcript adds one clean round; any edit resets its streak to zero.
6. Repeat. After **three consecutive rounds with no edits**, recordings move to **Delivery**. Download the JSON records and individual audio files.

New transcripts wait for the next round. Reviewed tasks cannot be claimed again in the same round. Claims expire after 15 minutes. Refresh the workspace to see changes from other users.

## Automatic transcription

The adapter uses the [OpenAI transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription). Language is sent explicitly and the project locale is included as transcription guidance. See the [model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe).

1. Set `OPENAI_API_KEY`, `STT_MODEL`, and a strong random `WORKER_SECRET` in the server's private environment.
2. Choose **OpenAI transcription** in project settings.
3. Copy `.env.worker.example` to `.env.worker`, fill in the application URL and the same worker secret, then run `npm run worker` separately.

The worker processes only Quick-Review-approved recordings. Jobs persist in the database, are leased atomically, retry with delay, and become failed after three attempts. A crashed worker's lease expires after three minutes. Administrators can retry failures or import a real transcript manually. No provider key is included and live paid transcription is not exercised by the tests.

Provider calls are separate from user upload/review requests. A request timeout is 120 seconds. A successful external call whose result is lost during a crash may be billed again when the lease is reclaimed; database completion rejects stale leases, but the external service cannot be made exactly-once by this pilot.

## Authentication and team access

Separate login pages are available at `/login/contributor`, `/login/qa`, `/login/team-leader`, and `/login/admin`. Each page has its own visual design and supports validated email/password login, password visibility controls, Google login, and account signup. Signup collects full name, email, phone number, occupation/current status, relevant work or study details, organization, city, country, password confirmation, and requested portal. Requesting QA, Team Leader, or Administrator access never grants that role automatically.

Authentication uses Supabase Auth with server-managed PKCE cookies. Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, enable the Email and Google providers in Supabase Auth, and add these redirect URLs to the project's allow list:

```text
http://localhost:3000/auth/callback
https://your-hostname.example/auth/callback
```

For Google, copy Supabase's provider callback URL into the Google Cloud OAuth client, then add the Google client ID and secret in the Supabase provider settings. The Google secret belongs in Supabase, not this repository.

`/workspace` checks the authenticated account's assigned role on the server; selecting or requesting another portal does not grant access. Set `ADMIN_EMAIL` to the owner's exact email. Administrators can grant and change every role and view system metrics. Team Leaders can coordinate reviews, transcripts, project settings, rounds, and delivery, but cannot manage access or view administrator-only metrics. Unassigned accounts see an invitation message, and accounts with a different role are guided to their assigned portal. Audio and delivery endpoints repeat the server-side authorization check.

If Supabase Auth is not configured, a trusted Sites identity remains available for existing hosted environments. The local demo is only for localhost development and is not an Internet-facing authentication system.

## Contributor collection architecture

Contributor requirements come from the server-owned project schema. The schema controls the brief, prompt or topic, language and locale, recording environment, duration, formats, target sample rate, bit depth, channel mode, consent copy, and dynamic intake fields. The page skips optional brief rows that have no value.

The contributor APIs are:

```text
GET  /api/projects/:id/schema
POST /api/recordings/upload-url
POST /api/recordings
GET  /api/contributors/me/recordings
GET  /api/recordings/:id
POST /api/recordings/:id/resubmit
```

Production uploads use short-lived, multipart R2 upload URLs. Audio travels from the browser to private object storage rather than through the application server. Each request has a contributor-scoped idempotency key, size/type/duration limits are repeated on the server, and completion verifies every expected part and the final object size. The background worker validates the stored file signature and checksum before the recording enters Quick Review. Upload sessions, processing jobs and contributor list/detail reads can be resumed safely after ordinary connection failures.

Set the four `R2_*` values shown in `.env.example` with an R2 S3 API token that can write only the audio bucket. Configure the bucket CORS policy to allow the website origin to send `PUT` with `Content-Type` and expose the `ETag` response header. Keep the bucket private. Local demo mode keeps the smaller application upload path so the complete workflow can be tested without cloud credentials.

## Implementation and deliberate MVP limits

- TypeScript, React, the Next.js-compatible Vinext runtime, Tailwind and shadcn UI.
- Supabase PostgreSQL for hosted metadata, R2 for private audio, and a separate polling transcription worker. Local development falls back to D1 when Supabase is not configured.
- The workspace is saved as a revisioned PostgreSQL JSONB document with secured relational operational views. A PostgreSQL compare-and-swap function atomically commits each entire workflow transition; conflicting requests re-read and re-check eligibility. This prevents duplicate claims, duplicate round submissions, and lost updates.
- Original transcripts, per-round edits, Quick Review feedback, checksums and audit events are retained. A round's eligible task set is fixed when opened.
- One project/workspace per deployment; a maximum of 500 active recording tasks. Direct object-storage uploads remove audio bandwidth from application workers, but the revisioned JSONB aggregate remains a pilot persistence model. Production concurrency of 500–1,500 users still needs environment-specific load testing and a move to independently writable normalized task/upload tables.
- The browser measures decoded duration and sound energy before submission and shows the decoded sample rate when available. The worker verifies the stored object's size, container signature and SHA-256 checksum. Target bit depth and channel mode are project guidance; a full production media probe and malware scan remain deployment work. Delivery is a JSON manifest plus separate protected audio downloads, not a ZIP package.
- A team activity log and queue counts are included. Daily targets, Slack alerts, payments, marketplace features and advanced analytics are deferred.
- Before a larger rollout: move high-volume writes from the JSONB aggregate to independently writable normalized tables, move queues and cross-instance rate limits to BullMQ/Redis, and complete backup/restore, observability, load and dependency-security reviews.

The supplied stack document recommends Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ and S3 for the production architecture. This implementation uses the equivalent Sites-compatible modular backend, Supabase PostgreSQL and private R2 storage while keeping the documented workflow semantics. See [docs/architecture.md](docs/architecture.md) for the mapping.

## Supabase PostgreSQL

Apply `supabase/migrations/202609050001_fieldnote_workspace.sql` to the selected Supabase project with the Supabase CLI migration workflow. Then configure these values only in the server's private environment:

```text
DATABASE_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_WORKSPACE_ID=main
```

Use the project's publishable key for authentication and a dedicated modern secret key for server-only database access. Never place the secret key in client code, a `NEXT_PUBLIC_` variable, Git, screenshots or chat. The migration enables Row Level Security, removes public/authenticated grants, grants only the server role, and exposes secured operational views for projects, team members, tasks, audio assets, reviews, rounds, transcription jobs, audit records and delivery data. See [supabase/README.md](supabase/README.md).

## Validation

```sh
npm run typecheck
npm test
npm run build
```

With the local website running, `npm run test:backend` performs a non-destructive readiness check of the database, private object storage, monitoring output and administrator-only access. `GET /api/health` is the infrastructure health endpoint. `GET /api/metrics` provides protected operational totals to administrators.

For a fresh, running local demo database, `node tests/api-smoke.mjs` exercises upload, concurrent claims, authorization, review gates, three-round finalization, export and audio retrieval. It intentionally refuses to run if recordings already exist and leaves one clearly labelled silent fixture in the local database. Do not run it against production.

With the local demo server running, `node tests/login-smoke.mjs` checks all three login routes and workspace redirects without changing workspace records. Unit tests cover the complete role-to-portal access matrix.

GitHub Actions runs type checking, workflow tests and the production build on pushes and pull requests. Browser recording permissions, physical microphone capture and a live transcription provider must be checked on the intended devices before inviting a team.

## Hosting

`.openai/hosting.json` declares the local fallback D1 and private R2 bindings for Sites. Apply the Supabase migration, configure the private Supabase server variables, build, and publish a saved version. Keep the application behind trusted Sites authentication. Never upload `.dev.vars`, `.env.worker`, `.wrangler/`, recordings or API keys to GitHub.

`Dockerfile` and `compose.yaml` provide an optional **local demo** container with a persisted `.wrangler` volume. Run `docker compose up --build` and open `http://localhost:3000`. This runs a development server, not a production deployment.

### Hosted worker access

The default hosted pilot uses manual transcript import. The standalone automatic worker needs network access to the API. Owner-only Sites authentication also applies to worker requests; a bearer secret alone does not bypass that outer sign-in gate. Use the automatic worker against the local runtime, or provide a hosting-supported service access/background-job integration before enabling it on a private hosted deployment.
