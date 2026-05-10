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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { action, role } = body // action: 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
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

  const { data: req } = await admin
    .from('join_requests')
    .select('id, user_id, empresa_id, role, status')
    .eq('id', id)
    .maybeSingle()

  if (!req) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'Solicitação já processada.' }, { status: 400 })
  }

  const { data: membership } = await admin
    .from('usuarios_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', req.empresa_id)
    .maybeSingle()

  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins podem processar solicitações.' }, { status: 403 })
  }

  if (action === 'approve') {
    const roleAtribuida = ['planejador', 'operator', 'viewer'].includes(role) ? role : req.role
    await admin.from('usuarios_empresas').insert({
      user_id: req.user_id,
      empresa_id: req.empresa_id,
      role: roleAtribuida,
      is_owner: false,
    })
    await createAuditLog({
      actorId: user.id,
      targetType: 'membro',
      targetId: req.user_id,
      action: 'member_added',
      details: { role: roleAtribuida, via: 'join_request' },
      empresaId: req.empresa_id,
    })
  }

  await admin
    .from('join_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ success: true })
}
