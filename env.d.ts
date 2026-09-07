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
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    SUPABASE_WORKSPACE_ID?: string;
    R2_ACCOUNT_ID?: string;
    R2_BUCKET_NAME?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
  }
}
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
