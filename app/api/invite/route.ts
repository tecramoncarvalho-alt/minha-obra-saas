import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { email, role, empresa_id } = await request.json()

  if (!email || !role || !empresa_id) {
    return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
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

  // Verifica se o solicitante é admin da empresa
  const { data: membership } = await supabase
    .from('usuarios_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresa_id)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  // Envia convite usando service role (cria user e envia email)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${request.headers.get('origin')}/auth/callback`,
    data: { empresa_id, role },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
