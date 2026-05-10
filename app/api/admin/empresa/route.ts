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

async function getAuthContext(supabase: ReturnType<typeof createServerClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminClient()
  const { data: membership } = await admin
    .from('usuarios_empresas')
    .select('role, empresa_id, is_owner')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership?.empresa_id) return null
  return { user, role: membership.role as string, empresaId: membership.empresa_id as string, isOwner: !!membership.is_owner }
}

function makeSupabaseServer(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = makeSupabaseServer(cookieStore)
  const auth = await getAuthContext(supabase)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { nome, cnpj, endereco, email_cadastro, email_recuperacao } = body

  const admin = adminClient()
  const updates: Record<string, string> = {}
  if (nome?.trim()) updates.nome = nome.trim()
  if (cnpj !== undefined) updates.cnpj = cnpj
  if (endereco !== undefined) updates.endereco = endereco
  if (email_cadastro !== undefined) updates.email_cadastro = email_cadastro
  if (email_recuperacao !== undefined) updates.email_recuperacao = email_recuperacao

  const { error } = await admin.from('empresas').update(updates).eq('id', auth.empresaId)
  if (error) return NextResponse.json({ error: 'Erro ao atualizar empresa.' }, { status: 500 })

  await createAuditLog({
    actorId: auth.user.id,
    targetType: 'empresa',
    targetId: auth.empresaId,
    action: 'update',
    details: updates,
    empresaId: auth.empresaId,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = makeSupabaseServer(cookieStore)
  const auth = await getAuthContext(supabase)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!auth.isOwner) return NextResponse.json({ error: 'Apenas o owner pode deletar a empresa.' }, { status: 403 })

  const admin = adminClient()

  await createAuditLog({
    actorId: auth.user.id,
    targetType: 'empresa',
    targetId: auth.empresaId,
    action: 'delete',
    empresaId: auth.empresaId,
  })

  const { error } = await admin.from('empresas').delete().eq('id', auth.empresaId)
  if (error) return NextResponse.json({ error: 'Erro ao deletar empresa.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
