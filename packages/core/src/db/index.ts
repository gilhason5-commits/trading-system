import { getEnv } from "../env.ts";
import { MockRepository } from "./mock.ts";
import type { Repository } from "./repository.ts";

export type { Repository } from "./repository.ts";
export { MockRepository } from "./mock.ts";

// Factory: Supabase when SUPABASE_URL is configured and DATA_MODE=live,
// otherwise the in-memory mock. The Supabase impl lands in supabase.ts (Step 3+).
let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  const env = getEnv();
  if (env.DATA_MODE === "live" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    // Lazy import once the Supabase implementation exists.
    throw new Error(
      "Supabase repository not wired yet — set DATA_MODE=mock until Step 3 lands supabase.ts",
    );
  }
  instance = new MockRepository();
  return instance;
}

/** Test/server-action helper to reset the in-memory store. */
export function resetRepository(): void {
  instance = null;
}
