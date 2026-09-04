declare namespace Cloudflare {
 interface Env {FILES: R2Bucket; DB: D1Database; LOCAL_DEMO?: string; ADMIN_EMAIL?: string; OPENAI_API_KEY?: string; STT_MODEL?: string; WORKER_SECRET?: string;}
}
interface ImportMeta {readonly env: {readonly DEV:boolean};}
