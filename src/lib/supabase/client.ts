import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  // During build/prerender, env vars may not be available.
  // Return a cached instance if we already have one.
  if (clientInstance) return clientInstance;

  if (!supabaseUrl || !supabaseAnonKey) {
    // In production builds, this can happen during static page generation.
    // Return a stub client that won't crash but also won't work.
    // Pages that actually need Supabase are client-side rendered anyway.
    if (typeof window === "undefined") {
      // Server-side during build: return a minimal client with placeholder values
      // that will be replaced at runtime when real env vars are present.
      return createBrowserClient<Database>(
        "https://placeholder.supabase.co",
        "placeholder-key"
      );
    }
    // Client-side without env vars is a real problem
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  clientInstance = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return clientInstance;
}
