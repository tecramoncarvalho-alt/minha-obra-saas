import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

async function getUserAndRole(supabase: ReturnType<typeof makeSupabase>, obraId: number) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: obra } = await supabase
    .from('obras')
    .select('empresa_id')
    .eq('id', obraId)
    .single()

  if (!obra) return null

  const { data: membership } = await supabase
    .from('usuarios_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', obra.empresa_id)
    .single()

  if (!membership) return null
  return { user, role: membership.role as string }
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const obraId = parseInt(id, 10)
  if (isNaN(obraId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  const auth = await getUserAndRole(supabase, obraId)

  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!['admin', 'planejador'].includes(auth.role)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('obras')
    .update({ tv_token: crypto.randomUUID() })
    .eq('id', obraId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
