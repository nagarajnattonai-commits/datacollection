import { env } from 'cloudflare:workers';
import {
  initialState,
  normalizeState,
  WorkflowError,
  type State,
} from './workflow';
import {
  parseSupabaseStoreConfig,
  SupabaseWorkspaceStore,
} from './supabase-store';

function supabaseStore() {
  const config = parseSupabaseStoreConfig(env);
  return config ? new SupabaseWorkspaceStore(config) : null;
}

export function databaseProvider() {
  return supabaseStore() ? 'supabase-postgresql' : 'local-d1';
}
export function db() {
  return env.DB;
}
export async function readState(): Promise<{ state: State; revision: number }> {
  const postgres = supabaseStore();
  if (postgres) {
    const row = await postgres.read();
    return { ...row, state: normalizeState(row.state) };
  }
  await db()
    .prepare(
      'INSERT OR IGNORE INTO workspace (id, revision, body) VALUES (?, 0, ?)',
    )
    .bind('main', JSON.stringify(initialState()))
    .run();
  const row = await db()
    .prepare('SELECT body, revision FROM workspace WHERE id = ?')
    .bind('main')
    .first<{ body: string; revision: number }>();
  if (!row) throw new Error('Workspace is unavailable.');
  return {
    state: normalizeState(JSON.parse(row.body) as State),
    revision: row.revision,
  };
}
export async function mutate<T>(fn: (state: State) => T): Promise<T> {
  // Optimistic compare-and-swap makes each complete workflow transition atomic.
  // On contention the operation is re-evaluated against the latest committed state.
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state, revision } = await readState();
    const result = fn(state);
    const postgres = supabaseStore();
    if (postgres) {
      if (await postgres.compareAndSwap(revision, state)) return result;
    } else {
      const saved = await db()
        .prepare(
          'UPDATE workspace SET body = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
        )
        .bind(JSON.stringify(state), 'main', revision)
        .run();
      if (saved.meta.changes === 1) return result;
    }
  }
  throw new WorkflowError('The workspace is busy. Please try again.');
}
