# Workflow implementation

The source documents are `audio_data_collection_architecture.pdf`, `audio_data_collection_system_design.pdf`, and `audio_platform_tech_stack.pdf` in the supplied parent folder.

| Required behavior            | Implementation                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| Contributor audio collection | Browser MediaRecorder, upload, playback speed, discard and retake           |
| Audio separate from metadata | Private R2 object, SHA-256 checksum, Supabase PostgreSQL metadata           |
| Quick Review before STT      | Server state transition from QUICK_REVIEW to STT_PENDING only on approval   |
| Exclusive QA claims          | Atomic revision compare-and-swap; 15-minute expiry; excludes own recordings |
| Background STT               | Durable pending jobs, leases, separately runnable worker, retry/backoff     |
| Project language and locale  | Configurable language, locale, requirements, vocabulary and provider        |
| Deep Review rounds           | Frozen membership at open; exactly one submission per task per round        |
| Administrator gate           | Closure rejects incomplete rounds and evaluates all task streaks atomically |
| Three no-edit rounds         | Any edit resets to zero; three consecutive unchanged results finalize       |
| Previous edits visible       | Immutable original transcript and before/after review records               |
| Randomization                | Random shuffle of available tasks before each batch claim                   |
| Monitoring                   | Status counts, round progress, team membership and audit activity           |
| Delivery                     | JSON manifest and protected individual audio downloads                      |

## Backend readiness additions

The test-ready backend remains a modular monolith, matching the supplied recommendation to avoid early microservices. The web application, workflow engine and API layer share one deployable service; transcription runs as a separate worker. The implementation uses the Sites runtime equivalents of the recommended infrastructure so the website can run as one testable deployment:

| Document recommendation       | Test-ready implementation                                                                                       | Production growth path                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Next.js and React             | Vinext's Next-compatible React runtime                                                                          | Keep stateless UI instances                                                                    |
| NestJS modular API            | Typed server route modules plus a pure workflow domain module                                                   | Extract modules to NestJS when the API becomes independently deployed                          |
| PostgreSQL and Prisma         | Supabase PostgreSQL JSONB source of truth, atomic SQL compare-and-swap, migrations and secured relational views | Move high-volume entity writes into normalized PostgreSQL tables before the 1,000-user rollout |
| Redis and BullMQ              | Durable job state, leases, retry delay and an independently running worker                                      | Move jobs and cross-instance rate limits to managed Redis and BullMQ                           |
| S3-compatible storage         | Private R2 object storage with checksums and protected retrieval                                                | Use direct signed uploads when file volume requires it                                         |
| JWT or session auth with RBAC | Supabase sessions with server-side Contributor, QA, Team Leader and Administrator checks                        | Administrator controls access; Team Leader controls project operations                          |
| Sentry and structured logs    | Request IDs, JSON job/action logs, health checks and protected operational metrics                              | Connect logs and errors to the selected monitoring provider                                    |

The backend also enforces the complete contributor audio-quality confirmation set. A client cannot bypass the checklist by calling the upload endpoint directly. The confirmed criteria and criteria version are retained with each new task and included in final delivery records.

### Service endpoints

- `GET /api/health` checks database and object-storage availability without returning workspace data.
- `GET /api/metrics` is Administrator-only and reports team composition, task state totals, claims, transcription backlog/failures, the active round and delivery readiness.
- `GET /api/workspace` returns a role-filtered workspace snapshot and protected audio or final delivery records.
- `POST /api/workspace` validates and applies contributor, reviewer, team leader and administrator actions through the workflow engine.
- `POST /api/jobs` is worker-secret protected and leases one asynchronous transcription job at a time.

Write APIs use same-origin checks, bounded request sizes, validated input, role authorization and best-effort per-instance rate limits. Responses carry a request ID and private no-cache/security headers. Review decisions, transcript versions, round actions and team changes remain auditable. The audit list is bounded for the pilot; long-term production audit retention should move to normalized append-only storage.

## Transaction boundary

Each operation reads `(body, revision)`, applies a pure transition to that snapshot, then updates only if the revision still matches. A failed conditional update restarts the operation against current state, up to twelve attempts. Reads never overwrite concurrent work. Audio uploads are stored first; failed metadata writes trigger best-effort object cleanup. A process crash between object write and metadata commit can leave an orphan object; periodic reconciliation is a future production requirement.

The aggregate keeps this pilot easy to inspect and makes cross-task round closure atomic. Supabase stores it as JSONB and exposes secured relational views for operational queries. It intentionally limits each workspace to 500 recordings. Before heavy or long-running use, split users, tasks, reviews, rounds and jobs into independently writable normalized PostgreSQL tables while keeping the transition invariants inside database transactions.

## STT safety

A job lease is committed before calling the provider. Completion checks the lease token, preventing an expired worker from overwriting a newer result. Only the server environment holds the provider key and worker secret. The endpoint accepts no caller-selected provider URL. Manual import is restricted to administrators and only pending/failed jobs; it cannot overwrite a running job or a previously accepted original transcript.

## Test boundaries

Unit tests cover claim ownership/expiry, self-review prevention, duplicate submissions, frozen rounds, early-close rejection, no-edit streaks, edit resets, authorization, job leases, Supabase configuration and PostgreSQL compare-and-swap requests. The HTTP smoke test exercises local D1 fallback persistence and R2 audio storage. A connected Supabase project is required for remote PostgreSQL migration and integration testing. Live STT, microphone hardware, deployment authentication and production scaling require environment-specific validation.
