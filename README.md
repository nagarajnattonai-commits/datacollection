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

1. Select **Contributor**, record or upload an audio file, play it back, and submit it. Uploads accept WAV, MP3, WebM, M4A, OGG and FLAC, up to 20 MB. Retakes are new submissions; the rejected recording and its feedback remain in history.
2. Select **QA reviewer**, open **Quick Review**, claim a batch, listen, then approve or request a retake with feedback. Reviewers cannot claim their own submissions.
3. Select **Administrator** and open **Manage project**. With the default manual provider, import the real transcript for approved audio. Manual imports are labelled and do not pretend to be machine transcription.
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

Separate login pages are available at `/login/contributor`, `/login/qa`, and `/login/admin` (Administrator / Team Leader). They use distinct layouts and open the recording studio, Quick Review, and project management respectively. `/workspace` checks the signed-in account's assigned role on the server; selecting another portal does not grant access. Unassigned accounts see an invitation message, and accounts with a different role are guided to their assigned portal. Sign-out is available in the workspace.

The hosted platform may show its access gate before these custom pages. Each portal continues through Sign in with ChatGPT using a same-origin return path.

Hosted operation uses the Sites authenticated identity, not a custom password system. Set `ADMIN_EMAIL` to the owner's exact sign-in email. That account can grant contributor, QA, or administrator access in **Manage project**. Team members also need access through the hosting platform's access policy. Audio and delivery endpoints check server-side authorization.

**Trust boundary:** identity headers are trusted only behind the Sites dispatcher, which must replace caller-supplied identity headers. Do not expose this Worker through another ingress that accepts arbitrary `oai-authenticated-*` headers. The local demo is not an Internet-facing authentication system.

## Implementation and deliberate MVP limits

- TypeScript, React, the Next.js-compatible Vinext runtime, Tailwind and shadcn UI.
- Supabase PostgreSQL for hosted metadata, R2 for private audio, and a separate polling transcription worker. Local development falls back to D1 when Supabase is not configured.
- The workspace is saved as a revisioned PostgreSQL JSONB document with secured relational operational views. A PostgreSQL compare-and-swap function atomically commits each entire workflow transition; conflicting requests re-read and re-check eligibility. This prevents duplicate claims, duplicate round submissions, and lost updates.
- Original transcripts, per-round edits, Quick Review feedback, checksums and audit events are retained. A round's eligible task set is fixed when opened.
- One project/workspace per deployment; a maximum of 500 recordings. This is a **pilot**, not the 1,000-user deployment described in the recommendations. It has not been load-tested for that scale.
- Uploads pass through the application and use container-signature checks; duration, sample rate, channel count and silence detection are not independently measured. Header validation is not a complete media decoder or malware scan. Delivery is a JSON manifest plus separate protected audio downloads, not a ZIP package.
- A team activity log and queue counts are included. Daily targets, Slack alerts, payments, marketplace features and advanced analytics are deferred.
- Before a larger rollout: move high-volume writes from the JSONB aggregate to independently writable normalized tables, add presigned uploads/downloads, move queues and cross-instance rate limits to BullMQ/Redis, and complete backup/restore, observability, load and dependency-security reviews.

The supplied stack document recommends Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ and S3 for the production architecture. This implementation uses the equivalent Sites-compatible modular backend, Supabase PostgreSQL and private R2 storage while keeping the documented workflow semantics. See [docs/architecture.md](docs/architecture.md) for the mapping.

## Supabase PostgreSQL

Apply `supabase/migrations/202609050001_fieldnote_workspace.sql` to the selected Supabase project with the Supabase CLI migration workflow. Then configure these values only in the server's private environment:

```text
DATABASE_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_WORKSPACE_ID=main
```

Use a dedicated modern Supabase secret key. Do not place it in client code, a `NEXT_PUBLIC_` variable, Git, screenshots or chat. The migration enables Row Level Security, removes public/authenticated grants, grants only the server role, and exposes secured operational views for projects, team members, tasks, audio assets, reviews, rounds, transcription jobs, audit records and delivery data. See [supabase/README.md](supabase/README.md).

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
