export type Role = 'contributor' | 'qa' | 'admin';
export type Actor = { id: string; email: string; role: Role };
export type Status =
  | 'QUICK_REVIEW'
  | 'REJECTED'
  | 'STT_PENDING'
  | 'STT_PROCESSING'
  | 'STT_FAILED'
  | 'DEEP_REVIEW'
  | 'READY_TO_DELIVER';
export type Claim = { userId: string; expires: number };
export type Review = {
  round: number;
  actor: string;
  before: string;
  after: string;
  edited: boolean;
  at: number;
};
export type Task = {
  id: string;
  name: string;
  contributor: string;
  created: number;
  audioKey: string;
  mime: string;
  bytes: number;
  checksum: string;
  quality?: {
    criteriaVersion: number;
    confirmed: string[];
    confirmedAt: number;
  };
  language: string;
  locale: string;
  status: Status;
  transcript: string;
  originalTranscript: string | null;
  source?: string;
  streak: number;
  claim?: Claim;
  reviews: Review[];
  quick?: { actor: string; approved: boolean; note: string; at: number };
  job: {
    attempts: number;
    nextAttempt: number;
    lease?: string;
    leaseUntil?: number;
    error?: string;
  };
};
export type Round = {
  number: number;
  status: 'open' | 'closed';
  taskIds: string[];
  opened: number;
  closed?: number;
};
export type State = {
  config: {
    name: string;
    language: string;
    locale: string;
    requirements: string;
    vocabulary: string;
    provider: 'manual' | 'openai';
  };
  members: { email: string; role: Role }[];
  tasks: Task[];
  rounds: Round[];
  audit: { actor: string; action: string; taskId?: string; at: number }[];
};
export const initialState = (): State => ({
  config: {
    name: 'Speech collection pilot',
    language: 'ta',
    locale: 'ta-IN',
    requirements:
      'Speak naturally in a quiet space. Record one speaker at a time. Avoid names, phone numbers and other private information. Maximum file size: 20 MB.',
    vocabulary: '',
    provider: 'manual',
  },
  members: [],
  tasks: [],
  rounds: [],
  audit: [],
});
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function requireRole(actor: Actor, roles: Role[]) {
  if (!roles.includes(actor.role))
    throw new WorkflowError('You do not have permission for this action.', 403);
}
export function audit(
  state: State,
  actor: Actor,
  action: string,
  now: number,
  taskId?: string,
) {
  state.audit.push({ actor: actor.email, action, at: now, taskId });
  if (state.audit.length > 5000)
    state.audit.splice(0, state.audit.length - 5000);
}
export function currentRound(state: State) {
  return state.rounds.find((r) => r.status === 'open');
}
export function findTask(state: State, id: string) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new WorkflowError('Recording not found.', 404);
  return task;
}
export function assertClaim(task: Task, actor: Actor, now: number) {
  if (task.claim?.userId !== actor.id || task.claim.expires <= now)
    throw new WorkflowError(
      'Your claim expired or belongs to another reviewer. Claim the task again.',
    );
}
export function addTask(state: State, actor: Actor, task: Task, now: number) {
  requireRole(actor, ['contributor', 'admin']);
  if (state.tasks.length >= 500)
    throw new WorkflowError(
      'This pilot is limited to 500 recordings. Export and start a new workspace before adding more.',
    );
  if (state.tasks.some((t) => t.id === task.id))
    throw new WorkflowError('Recording already submitted.');
  state.tasks.push(task);
  audit(state, actor, 'Audio submitted', now, task.id);
}
export function claimTasks(
  state: State,
  actor: Actor,
  kind: 'quick' | 'deep',
  count: number,
  now: number,
) {
  requireRole(actor, ['qa', 'admin']);
  if (!Number.isInteger(count) || count < 1 || count > 10)
    throw new WorkflowError('Claim between 1 and 10 tasks.', 400);
  const round = currentRound(state);
  if (kind === 'deep' && !round)
    throw new WorkflowError('No Deep Review round is open.');
  const eligible = (t: Task) =>
    t.contributor !== actor.id &&
    (kind === 'quick'
      ? t.status === 'QUICK_REVIEW'
      : t.status === 'DEEP_REVIEW' &&
        round!.taskIds.includes(t.id) &&
        !t.reviews.some((r) => r.round === round!.number));
  const owned = state.tasks.filter(
    (t) => eligible(t) && t.claim?.userId === actor.id && t.claim.expires > now,
  );
  const tasks = state.tasks.filter(
    (t) => eligible(t) && (!t.claim || t.claim.expires <= now),
  );
  // Randomize only unclaimed work. Existing live claims are never reassigned.
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  const claimed = tasks.slice(0, Math.max(0, count - owned.length));
  for (const task of claimed)
    task.claim = { userId: actor.id, expires: now + 15 * 60_000 };
  audit(state, actor, `Claimed ${claimed.length} ${kind} tasks`, now);
  return [...owned, ...claimed].map((t) => t.id);
}
export function quickReview(
  state: State,
  actor: Actor,
  id: string,
  approved: boolean,
  note: string,
  now: number,
) {
  requireRole(actor, ['qa', 'admin']);
  const task = findTask(state, id);
  if (task.status !== 'QUICK_REVIEW')
    throw new WorkflowError('This recording has already been reviewed.');
  assertClaim(task, actor, now);
  if (!approved && !note.trim())
    throw new WorkflowError(
      'Give the contributor a reason for the retake.',
      400,
    );
  task.quick = { actor: actor.email, approved, note: note.trim(), at: now };
  task.status = approved ? 'STT_PENDING' : 'REJECTED';
  delete task.claim;
  audit(
    state,
    actor,
    approved ? 'Quick Review approved' : 'Retake requested',
    now,
    id,
  );
}
export function setTranscript(
  state: State,
  actor: Actor,
  id: string,
  text: string,
  source: string,
  now: number,
) {
  requireRole(actor, ['admin']);
  const task = findTask(state, id);
  if (!['STT_PENDING', 'STT_FAILED'].includes(task.status))
    throw new WorkflowError('This task is not waiting for a transcript.');
  if (!text.trim() || text.length > 50000)
    throw new WorkflowError(
      'Enter a transcript between 1 and 50,000 characters.',
      400,
    );
  task.originalTranscript = text.trim();
  task.transcript = text.trim();
  task.source = source;
  task.status = 'DEEP_REVIEW';
  task.job.error = undefined;
  audit(state, actor, 'Original transcript imported', now, id);
}
export function openRound(state: State, actor: Actor, now: number) {
  requireRole(actor, ['admin']);
  if (currentRound(state))
    throw new WorkflowError('Close the current round first.');
  const taskIds = state.tasks
    .filter((t) => t.status === 'DEEP_REVIEW')
    .map((t) => t.id);
  if (!taskIds.length)
    throw new WorkflowError('No transcribed recordings are eligible.');
  state.rounds.push({
    number: state.rounds.length + 1,
    status: 'open',
    taskIds,
    opened: now,
  });
  audit(state, actor, 'Deep Review round opened', now);
}
export function deepReview(
  state: State,
  actor: Actor,
  id: string,
  text: string,
  now: number,
) {
  requireRole(actor, ['qa', 'admin']);
  const task = findTask(state, id);
  const round = currentRound(state);
  if (!round || !round.taskIds.includes(id) || task.status !== 'DEEP_REVIEW')
    throw new WorkflowError('This recording is not in the current round.');
  if (task.reviews.some((r) => r.round === round.number))
    throw new WorkflowError(
      'This recording has already been submitted for this round.',
    );
  assertClaim(task, actor, now);
  if (!text.trim() || text.length > 50000)
    throw new WorkflowError(
      'Enter a transcript between 1 and 50,000 characters.',
      400,
    );
  const after = text.trim();
  task.reviews.push({
    round: round.number,
    actor: actor.email,
    before: task.transcript,
    after,
    edited: after !== task.transcript,
    at: now,
  });
  task.transcript = after;
  delete task.claim;
  audit(state, actor, 'Deep Review submitted', now, id);
}
export function closeRound(state: State, actor: Actor, now: number) {
  requireRole(actor, ['admin']);
  const round = currentRound(state);
  if (!round) throw new WorkflowError('No round is open.');
  if (
    round.taskIds.some(
      (id) =>
        !findTask(state, id).reviews.some((r) => r.round === round.number),
    )
  )
    throw new WorkflowError(
      'Every recording in this round must be reviewed before closing.',
    );
  for (const id of round.taskIds) {
    const task = findTask(state, id);
    const review = task.reviews.find((r) => r.round === round.number)!;
    task.streak = review.edited ? 0 : task.streak + 1;
    if (task.streak >= 3) task.status = 'READY_TO_DELIVER';
  }
  round.status = 'closed';
  round.closed = now;
  audit(state, actor, 'Deep Review round closed and evaluated', now);
}
export function retryJob(state: State, actor: Actor, id: string, now: number) {
  requireRole(actor, ['admin']);
  const task = findTask(state, id);
  if (task.status !== 'STT_FAILED')
    throw new WorkflowError('Only failed transcription jobs can be retried.');
  task.status = 'STT_PENDING';
  task.job = { attempts: 0, nextAttempt: now };
  audit(state, actor, 'Transcription retry requested', now, id);
}
export function leaseJob(state: State, now: number, lease: string) {
  const task = state.tasks.find(
    (t) =>
      (t.status === 'STT_PENDING' && t.job.nextAttempt <= now) ||
      (t.status === 'STT_PROCESSING' && (t.job.leaseUntil ?? 0) <= now),
  );
  if (!task) return null;
  task.status = 'STT_PROCESSING';
  task.job.attempts++;
  task.job.lease = lease;
  task.job.leaseUntil = now + 180_000;
  return structuredClone(task);
}
export function finishJob(
  state: State,
  id: string,
  lease: string,
  result: { text?: string; error?: string },
  now: number,
) {
  const task = findTask(state, id);
  if (task.status !== 'STT_PROCESSING' || task.job.lease !== lease)
    throw new WorkflowError('Job lease is stale.');
  delete task.job.lease;
  delete task.job.leaseUntil;
  if (result.text?.trim()) {
    task.originalTranscript = result.text.trim();
    task.transcript = result.text.trim();
    task.source = 'openai';
    task.status = 'DEEP_REVIEW';
    delete task.job.error;
  } else {
    task.job.error = result.error ?? 'Transcription returned no text.';
    task.job.nextAttempt =
      now + Math.min(300_000, 30_000 * 2 ** task.job.attempts);
    task.status = task.job.attempts >= 3 ? 'STT_FAILED' : 'STT_PENDING';
  }
  audit(
    state,
    { id: 'worker', email: 'Transcription worker', role: 'admin' },
    result.text ? 'Transcription complete' : 'Transcription failed',
    now,
    id,
  );
}
