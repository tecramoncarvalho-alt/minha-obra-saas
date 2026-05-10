import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/app/lib/super-admin'
import { createAuditLog } from '@/app/lib/audit'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = adminClient()
  const { data: empresa } = await admin
    .from('empresas')
    .select('*, planos(*)')
    .eq('id', id)
    .maybeSingle()

  return NextResponse.json({ empresa })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { plan_id, subscription_status, expires_at, nome } = body

  const admin = adminClient()
  const updates: Record<string, unknown> = {}
  if (plan_id) updates.plan_id = plan_id
  if (subscription_status) updates.subscription_status = subscription_status
  if (expires_at !== undefined) updates.expires_at = expires_at
  if (nome?.trim()) updates.nome = nome.trim()

  const { error } = await admin.from('empresas').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 })

  await createAuditLog({
    actorId: user.id, targetType: 'empresa', targetId: id,
    action: plan_id ? 'plan_change' : 'status_change',
    details: updates as Record<string, unknown>,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = adminClient()

  await createAuditLog({
    actorId: user.id, targetType: 'empresa', targetId: id, action: 'delete',
    details: { via: 'super_admin' },
  })

  const { error } = await admin.from('empresas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Erro ao deletar.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
