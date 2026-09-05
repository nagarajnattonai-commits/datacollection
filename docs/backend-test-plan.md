# Backend test plan

This plan verifies the MVP described in the supplied architecture, system design and technology stack documents. It is safe to run the automated readiness check against the local demo because it reads infrastructure and metrics without changing recordings or workflow state.

## Automated checks

1. Start the local website.
2. Run `npm run typecheck` and `npm test` to verify input validation, roles, exclusive claims, claim expiry, review locking, transcription leases, retries, round gates, edit history and three-round finalization.
3. Run `npm run test:backend` to verify database and object-storage health, protected metrics and Contributor denial for Administrator metrics.
4. Run `npm run build` to verify the complete server and website production bundle.

The full `tests/api-smoke.mjs` scenario creates a labelled silent recording and exercises real local persistence. Run it only against a fresh local database; it refuses to run when recordings already exist.

## Manual role workflow

1. Open `/login/contributor`. Record or upload supported audio, play it back, confirm all six quality checks and submit it.
2. Confirm that a Contributor cannot open Administrator metrics or review another person's recording.
3. Open `/login/qa`. Claim a Quick Review batch, listen, then approve or request a retake. A retake requires feedback.
4. Open `/login/team-leader` to import a real transcript, coordinate review rounds, update project settings, and prepare delivery. Use `/login/admin` for team access changes and administrator-only system metrics.
5. Open a Deep Review round. As QA, claim each eligible task, view previous edits, make any needed correction and submit once.
6. Confirm that the Administrator cannot close an incomplete round. Finish all tasks and close it.
7. Repeat until one task receives three consecutive rounds without edits. Confirm it moves to Ready to Deliver and no longer appears in later rounds.
8. Export delivery records and retrieve the protected audio. Confirm the record includes checksum, original transcript, edit history and audio-quality confirmations.

## Operational checks

- `/api/health` returns `status: ok`, database `ok`, object storage `ok`, and an `X-Request-Id` header.
- An Administrator can read `/api/metrics`; Contributor and QA accounts receive an access error.
- Repeated excess API requests receive HTTP 429.
- `/api/jobs` rejects requests without the worker secret.
- Invalid formats, files over 20 MB, missing quality confirmations, malformed locale codes and oversized transcripts are rejected.
- A lost worker lease cannot overwrite a transcript completed by a later lease.

Hardware microphone permissions and live paid transcription need manual testing on the intended browsers and devices. The current hosted access policy also applies before application-level roles, so each tester must be invited to the Site and added to the Fieldnote team with the same email.
