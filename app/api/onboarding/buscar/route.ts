import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get('codigo')
  if (!codigo || codigo.length !== 8) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
  }

  const admin = adminClient()
  const { data: empresa } = await admin
    .from('empresas')
    .select('id, nome, subscription_status')
    .eq('codigo_empresa', codigo)
    .maybeSingle()

  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })

  return NextResponse.json({ empresa: { id: empresa.id, nome: empresa.nome } })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { empresa_id, role } = body

  if (!empresa_id) return NextResponse.json({ error: 'empresa_id obrigatório.' }, { status: 400 })

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
    return NextResponse.json({ error: 'Você já pertence a uma empresa.' }, { status: 400 })
  }

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, planos(max_users)')
    .eq('id', empresa_id)
    .maybeSingle()

  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })

  const plano = empresa.planos && (Array.isArray(empresa.planos) ? empresa.planos[0] : empresa.planos)
  if (plano) {
    const { count } = await admin
      .from('usuarios_empresas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa_id)
    if (count !== null && count >= plano.max_users) {
      return NextResponse.json({ error: 'Empresa atingiu o limite de usuários do plano.' }, { status: 400 })
    }
  }

  const roleAlvo = ['planejador', 'operator', 'viewer'].includes(role) ? role : 'viewer'

  const { error } = await admin.from('join_requests').upsert({
    user_id: user.id,
    empresa_id,
    status: 'pending',
    role: roleAlvo,
  }, { onConflict: 'user_id,empresa_id' })

  if (error) return NextResponse.json({ error: 'Erro ao enviar solicitação.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
