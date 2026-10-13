declare namespace Cloudflare {
  interface Env {
    RIG_QA_LOCAL_MOCK?: string;
    NEBIUS_API_KEY?: string;
    NEBIUS_LIVE_ALLOWED?: string;
    JUDGE_ALLOWED_USER_IDS?: string;
    JUDGE_BUDGET_GRANT_ID?: string;
    JUDGE_MAX_ATTEMPTS?: string;
    JUDGE_MAX_ATTEMPTS_PER_USER?: string;
    JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD?: string;
    JUDGE_TOTAL_MICRO_USD?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
