import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { nomeEmpresa } = await request.json()

  if (!nomeEmpresa?.trim()) {
    return NextResponse.json({ error: 'Nome da empresa é obrigatório.' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Impede criar empresa duplicada
  const { data: existing } = await admin
    .from('usuarios_empresas')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.empresa_id) {
    return NextResponse.json({ error: 'Usuário já possui uma empresa.' }, { status: 400 })
  }

  const { data: empresa, error: errEmpresa } = await admin
    .from('empresas')
    .insert({ nome: nomeEmpresa.trim() })
    .select('id')
    .single()

  if (errEmpresa || !empresa) {
    return NextResponse.json({ error: errEmpresa?.message ?? 'Falha ao criar empresa.' }, { status: 500 })
  }

  const { error: errVinculo } = await admin
    .from('usuarios_empresas')
    .insert({ user_id: user.id, empresa_id: empresa.id, role: 'admin' })

  if (errVinculo) {
    await admin.from('empresas').delete().eq('id', empresa.id)
    return NextResponse.json({ error: errVinculo.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
