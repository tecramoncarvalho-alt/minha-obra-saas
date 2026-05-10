import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: membership } = await admin
    .from('usuarios_empresas')
    .select('empresa_id, role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { data: membros } = await admin
    .from('usuarios_empresas')
    .select('user_id, role, is_owner, created_at')
    .eq('empresa_id', membership.empresa_id)
    .order('created_at')

  if (!membros || membros.length === 0) {
    return NextResponse.json({ membros: [] })
  }

  const userIds = membros.map(m => m.user_id)
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const userMap = new Map(
    (users?.users ?? []).filter(u => userIds.includes(u.id)).map(u => [u.id, u.email])
  )

  const enriched = membros.map(m => ({
    ...m,
    email: userMap.get(m.user_id) ?? null,
  }))

  return NextResponse.json({ membros: enriched })
}
