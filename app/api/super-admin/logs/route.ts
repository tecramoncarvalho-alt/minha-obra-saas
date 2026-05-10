import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/app/lib/super-admin'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { searchParams } = new URL(request.url)
  const empresaId = searchParams.get('empresa_id')
  const action = searchParams.get('action')
  const limit = parseInt(searchParams.get('limit') ?? '200', 10)

  let query = admin
    .from('audit_logs')
    .select('id, actor_id, target_type, target_id, action, details, empresa_id, created_at, empresas:empresa_id(nome)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (empresaId) query = query.eq('empresa_id', empresaId)
  if (action) query = query.eq('action', action)

  const { data: logs } = await query

  if (!logs || logs.length === 0) {
    return NextResponse.json({ logs: [] })
  }

  const actorIds = [...new Set(logs.map(l => l.actor_id).filter(Boolean))]
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map(
    (authData?.users ?? [])
      .filter(u => actorIds.includes(u.id))
      .map(u => [u.id, u.email ?? null])
  )

  const enriched = logs.map(l => ({
    ...l,
    actor_email: emailMap.get(l.actor_id) ?? null,
  }))

  return NextResponse.json({ logs: enriched })
}
