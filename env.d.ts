declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    DB: D1Database;
    LOCAL_DEMO?: string;
    ADMIN_EMAIL?: string;
    OPENAI_API_KEY?: string;
    STT_MODEL?: string;
    WORKER_SECRET?: string;
    DATABASE_PROVIDER?: string;
    SUPABASE_URL?: string;
    SUPABASE_SECRET_KEY?: string;
    SUPABASE_WORKSPACE_ID?: string;
  }
}
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
