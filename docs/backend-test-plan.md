# Backend test plan

This plan verifies the MVP described in the supplied architecture, system design and technology stack documents. It is safe to run the automated readiness check against the local demo because it reads infrastructure and metrics without changing recordings or workflow state.

## Automated checks

1. Start the local website.
2. Run `npm run typecheck` and `npm test` to verify input validation, roles, exclusive claims, claim expiry, review locking, transcription leases, retries, round gates, edit history and three-round finalization.
3. Run `npm run test:backend` to verify database and object-storage health, protected metrics and Contributor denial for Administrator metrics.
4. Run `npm run build` to verify the complete server and website production bundle.

With the local website running, `npm run test:contributor-load` exercises the schema and submissions read path with 500 virtual contributor sessions in batches. Set `VIRTUAL_USERS=1500` to run the document's current upper bound. This is a local API saturation check; the final production gate must run against an approved staging deployment with Supabase, private R2 direct uploads, realistic audio sizes and authenticated test accounts.

The full `tests/api-smoke.mjs` scenario creates a labelled silent recording and exercises real local persistence. Run it only against a fresh local database; it refuses to run when recordings already exist.

## Manual role workflow

1. Open `/login/contributor`. Confirm the configured project brief, prompt, technical limits and environment are visible. Record or upload supported audio and verify that invalid format, out-of-range duration and silent audio are stopped before submission.
2. Play the accepted recording, complete every required dynamic intake field and quality check, and accept the versioned consent. Confirm the submit button remains unavailable while a required item is missing.
3. Submit the recording. With production R2 credentials, confirm multipart upload progress is visible, audio goes directly to R2, and the item first shows **Checking audio** before reaching **Quick Review** after the worker runs. In local demo mode it enters Quick Review immediately.
4. Request a retake in Quick Review, return to the Contributor portal, select **Redo**, and submit a replacement. Confirm the task retains its identity and displays the previous attempt and feedback.
5. Confirm that a Contributor cannot open Administrator metrics or review another person's recording.
6. Continue through QA, transcription, Deep Review and delivery as described in the main README.

## Operational checks

- `/api/health` returns `status: ok`, database `ok`, object storage `ok`, and an `X-Request-Id` header.
- An Administrator can read `/api/metrics`; Contributor and QA accounts receive an access error.
- Repeated excess API requests receive HTTP 429.
- `/api/jobs` rejects requests without the worker secret.
- `/api/jobs/recordings` rejects requests without the worker secret and accepts only one active lease for each stored recording.
- A repeated upload idempotency key does not create a second task. An expired upload session cannot be completed.
- Invalid formats, files over 20 MB, missing quality confirmations, malformed locale codes and oversized transcripts are rejected.
- A lost worker lease cannot overwrite a transcript completed by a later lease.

Hardware microphone permissions, live R2 CORS behavior and paid transcription need manual testing on the intended browsers and devices. Run a production-like load test only in a dedicated Supabase/R2 environment; local concurrency results do not establish the 500–1,500 contributor target. The current hosted access policy also applies before application-level roles, so each tester must be invited to the Site and added to the Fieldnote team with the same email.
