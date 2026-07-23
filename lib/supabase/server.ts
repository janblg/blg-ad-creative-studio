import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Request-scoped Supabase client bound to the user's auth cookie. Subject to
 * Row-Level Security — this is what user-facing queries should use.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  const e = env();
  return createServerClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only;
            // middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
