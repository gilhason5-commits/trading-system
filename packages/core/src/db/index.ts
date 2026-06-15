import { getEnv } from "../env.ts";
import { MockRepository } from "./mock.ts";
import type { Repository } from "./repository.ts";
import { SupabaseRepository } from "./supabase.ts";

export type { Repository } from "./repository.ts";
export { MockRepository } from "./mock.ts";

// Factory: Supabase when SUPABASE_URL is configured and DATA_MODE=live,
// otherwise the in-memory mock.
let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  const env = getEnv();
  if (env.DATA_MODE === "live" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    instance = new SupabaseRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return instance;
  }
  instance = new MockRepository();
  return instance;
}

/** Test/server-action helper to reset the in-memory store. */
export function resetRepository(): void {
  instance = null;
}
