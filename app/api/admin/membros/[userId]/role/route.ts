import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAuditLog } from '@/app/lib/audit'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const body = await request.json().catch(() => ({}))
  const { role } = body

  const ROLES_VALIDOS = ['admin', 'planejador', 'operator', 'viewer']
  if (!ROLES_VALIDOS.includes(role)) {
    return NextResponse.json({ error: 'Role inválida.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = adminClient()

  const { data: actorMembership } = await admin
    .from('usuarios_empresas')
    .select('role, empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (actorMembership?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins podem alterar roles.' }, { status: 403 })
  }

  const { data: targetMembership } = await admin
    .from('usuarios_empresas')
    .select('role, is_owner')
    .eq('user_id', userId)
    .eq('empresa_id', actorMembership.empresa_id)
    .maybeSingle()

  if (!targetMembership) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
  if (targetMembership.is_owner) {
    return NextResponse.json({ error: 'Não é possível alterar a role do owner.' }, { status: 403 })
  }

  const roleAnterior = targetMembership.role
  await admin
    .from('usuarios_empresas')
    .update({ role })
    .eq('user_id', userId)
    .eq('empresa_id', actorMembership.empresa_id)

  await createAuditLog({
    actorId: user.id,
    targetType: 'membro',
    targetId: userId,
    action: 'role_change',
    details: { role_anterior: roleAnterior, role_nova: role },
    empresaId: actorMembership.empresa_id,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (userId === user.id) return NextResponse.json({ error: 'Não é possível remover a si mesmo.' }, { status: 400 })

  const admin = adminClient()

  const { data: actorMembership } = await admin
    .from('usuarios_empresas')
    .select('role, empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (actorMembership?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins podem remover membros.' }, { status: 403 })
  }

  const { data: targetMembership } = await admin
    .from('usuarios_empresas')
    .select('is_owner')
    .eq('user_id', userId)
    .eq('empresa_id', actorMembership.empresa_id)
    .maybeSingle()

  if (targetMembership?.is_owner) {
    return NextResponse.json({ error: 'Não é possível remover o owner.' }, { status: 403 })
  }

  await admin
    .from('usuarios_empresas')
    .delete()
    .eq('user_id', userId)
    .eq('empresa_id', actorMembership.empresa_id)

  await createAuditLog({
    actorId: user.id,
    targetType: 'membro',
    targetId: userId,
    action: 'member_removed',
    empresaId: actorMembership.empresa_id,
  })

  return NextResponse.json({ success: true })
}
