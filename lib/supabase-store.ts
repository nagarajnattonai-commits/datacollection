import { initialState, type State } from './workflow.ts';

export type SupabaseStoreConfig = {
  url: string;
  secretKey: string;
  workspaceId: string;
};

type SupabaseRow = { revision: number; state: State };

export function parseSupabaseStoreConfig(values: {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_WORKSPACE_ID?: string;
  DATABASE_PROVIDER?: string;
}): SupabaseStoreConfig | null {
  const url = values.SUPABASE_URL?.trim();
  const secretKey = values.SUPABASE_SECRET_KEY?.trim();
  const required = values.DATABASE_PROVIDER === 'supabase';
  if (!url && !secretKey) {
    if (required)
      throw new Error(
        'Supabase PostgreSQL is required but its server settings are missing.',
      );
    return null;
  }
  if (!url || !secretKey)
    throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL is invalid.');
  }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
    throw new Error(
      'SUPABASE_URL must use HTTPS except for local development.',
    );
  if (parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error('SUPABASE_URL must be a plain project origin.');
  const workspaceId = values.SUPABASE_WORKSPACE_ID?.trim() || 'main';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(workspaceId))
    throw new Error('SUPABASE_WORKSPACE_ID is invalid.');
  return {
    url: parsed.origin,
    secretKey,
    workspaceId,
  };
}

function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<State>;
  return Boolean(
    state.config &&
    Array.isArray(state.members) &&
    Array.isArray(state.tasks) &&
    Array.isArray(state.rounds) &&
    Array.isArray(state.audit),
  );
}

export class SupabaseWorkspaceStore {
  constructor(
    private readonly config: SupabaseStoreConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.config.secretKey);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    // Legacy service-role JWTs require a bearer header. Modern sb_secret keys do not.
    if (!this.config.secretKey.startsWith('sb_secret_'))
      headers.set('Authorization', `Bearer ${this.config.secretKey}`);
    const response = await this.fetcher(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok)
      throw new Error(`Supabase PostgreSQL returned HTTP ${response.status}.`);
    return response;
  }

  private async select(): Promise<SupabaseRow | null> {
    const id = encodeURIComponent(this.config.workspaceId);
    const response = await this.request(
      `fieldnote_workspaces?select=revision,state&id=eq.${id}&limit=1`,
    );
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as Partial<SupabaseRow>;
    if (!Number.isSafeInteger(row.revision) || !validState(row.state))
      throw new Error(
        'Supabase PostgreSQL returned an invalid workspace record.',
      );
    return { revision: row.revision!, state: row.state! };
  }

  async read(): Promise<SupabaseRow> {
    const existing = await this.select();
    if (existing) return existing;
    await this.request('fieldnote_workspaces', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        id: this.config.workspaceId,
        revision: 0,
        state: initialState(),
      }),
    });
    const created = await this.select();
    if (!created)
      throw new Error('Supabase workspace could not be initialized.');
    return created;
  }

  async compareAndSwap(
    expectedRevision: number,
    state: State,
  ): Promise<boolean> {
    const response = await this.request(
      'rpc/fieldnote_compare_and_swap_workspace',
      {
        method: 'POST',
        body: JSON.stringify({
          p_workspace_id: this.config.workspaceId,
          p_expected_revision: expectedRevision,
          p_state: state,
        }),
      },
    );
    return (await response.json()) === true;
  }
}
