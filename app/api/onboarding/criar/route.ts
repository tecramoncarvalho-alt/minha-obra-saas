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

async function gerarCodigoUnico(admin: ReturnType<typeof adminClient>): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const codigo = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')
    const { data } = await admin.from('empresas').select('id').eq('codigo_empresa', codigo).maybeSingle()
    if (!data) return codigo
  }
  return String(Date.now()).slice(-8)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { nomeEmpresa, cnpj, endereco, email_cadastro } = body

  if (!nomeEmpresa?.trim()) {
    return NextResponse.json({ error: 'Nome da empresa é obrigatório.' }, { status: 400 })
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

  const { data: existing } = await admin
    .from('usuarios_empresas')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.empresa_id) {
    return NextResponse.json({ error: 'Usuário já possui uma empresa.' }, { status: 400 })
  }

  const { data: planFree } = await admin
    .from('planos')
    .select('id')
    .eq('nome', 'Free')
    .maybeSingle()

  const codigo_empresa = await gerarCodigoUnico(admin)

  const { data: empresa, error: errEmpresa } = await admin
    .from('empresas')
    .insert({
      nome: nomeEmpresa.trim(),
      cnpj: cnpj?.trim() || null,
      endereco: endereco?.trim() || null,
      email_cadastro: email_cadastro?.trim() || null,
      codigo_empresa,
      plan_id: planFree?.id ?? null,
      subscription_status: 'Trial',
    })
    .select('id')
    .single()

  if (errEmpresa || !empresa) {
    return NextResponse.json({ error: 'Erro ao criar empresa.' }, { status: 500 })
  }

  const { error: errMembro } = await admin
    .from('usuarios_empresas')
    .insert({ user_id: user.id, empresa_id: empresa.id, role: 'admin', is_owner: true })

  if (errMembro) {
    await admin.from('empresas').delete().eq('id', empresa.id)
    return NextResponse.json({ error: 'Erro ao vincular usuário.' }, { status: 500 })
  }

  await admin.from('storage_quotas').insert({
    empresa_id: empresa.id,
    storage_usado_bytes: 0,
    storage_limite_bytes: 1 * 1024 * 1024 * 1024,
    plano: 'free',
  })

  await createAuditLog({
    actorId: user.id,
    targetType: 'empresa',
    targetId: empresa.id,
    action: 'create',
    details: { nome: nomeEmpresa.trim(), codigo_empresa },
    empresaId: empresa.id,
  })

  return NextResponse.json({ success: true })
}
