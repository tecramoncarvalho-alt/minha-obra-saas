import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient(): ReturnType<typeof createBrowserClient> {
  // During SSR/static generation NEXT_PUBLIC_* vars are not injected into the
  // static-page worker — return null sentinel (safe because all callers use the
  // client only inside useEffect / event handlers which never run on the server)
  if (typeof window === 'undefined') return null as unknown as ReturnType<typeof createBrowserClient>
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
