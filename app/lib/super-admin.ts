import { createClient } from '@supabase/supabase-js'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const admin = adminClient()
  const { data } = await admin
    .from('system_admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}
