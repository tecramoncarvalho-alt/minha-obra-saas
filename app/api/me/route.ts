import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ empresa: null, role: null })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: membership } = await admin
    .from('usuarios_empresas')
    .select('role, empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership?.empresa_id) {
    return NextResponse.json({ empresa: null, role: null })
  }

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, nome')
    .eq('id', membership.empresa_id)
    .maybeSingle()

  return NextResponse.json({
    empresa: empresa ?? null,
    role: membership.role ?? null,
  })
}
