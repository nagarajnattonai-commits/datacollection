# Workflow implementation

The source documents are `audio_data_collection_architecture.pdf`, `audio_data_collection_system_design.pdf`, and `audio_platform_tech_stack.pdf` in the supplied parent folder.

| Required behavior            | Implementation                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| Contributor audio collection | Browser MediaRecorder, upload, playback speed, discard and retake           |
| Audio separate from metadata | Private R2 object, SHA-256 checksum, D1 metadata                            |
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

## Transaction boundary

Each operation reads `(body, revision)`, applies a pure transition to that snapshot, then updates only if the revision still matches. A failed conditional update restarts the operation against current state, up to twelve attempts. Reads never overwrite concurrent work. Audio uploads are stored first; failed metadata writes trigger best-effort object cleanup. A process crash between object write and metadata commit can leave an orphan object; periodic reconciliation is a future production requirement.

The aggregate keeps this pilot easy to inspect and makes cross-task round closure atomic. It intentionally limits scale: the workspace cannot accept more than 500 recordings. History size also grows over time. Before heavy or long-running use, split users, tasks, reviews, rounds and jobs into normalized relational tables and migrate the transition invariants into database transactions.

## STT safety

A job lease is committed before calling the provider. Completion checks the lease token, preventing an expired worker from overwriting a newer result. Only the server environment holds the provider key and worker secret. The endpoint accepts no caller-selected provider URL. Manual import is restricted to administrators and only pending/failed jobs; it cannot overwrite a running job or a previously accepted original transcript.

## Test boundaries

Unit tests cover claim ownership/expiry, self-review prevention, duplicate submissions, frozen rounds, early-close rejection, no-edit streaks, edit resets, authorization and job lease/retry behavior. The HTTP smoke test exercises actual D1 persistence and R2 audio storage. Live STT, microphone hardware, deployment authentication and production scaling require environment-specific validation.
