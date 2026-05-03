import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { atualizarApontamento, deletarApontamento } from '@/app/lib/apontamentos'
import { ApontamentoDiarioUpdateSchema } from '@/app/lib/schemas'

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; apontamentoId: string }> }
) {
  const { id, apontamentoId } = await params
  const obraId = parseInt(id, 10)
  if (isNaN(obraId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  const auth = await getUserAndRole(supabase, obraId)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const body = await request.json()
  const result = ApontamentoDiarioUpdateSchema.safeParse(body)
  if (!result.success) {
    const mensagens = result.error.issues.map(i => i.message).join('; ')
    return NextResponse.json({ error: mensagens }, { status: 400 })
  }

  try {
    const apontamento = await atualizarApontamento(supabase, apontamentoId, result.data, auth.role)
    return NextResponse.json({ apontamento })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; apontamentoId: string }> }
) {
  const { id, apontamentoId } = await params
  const obraId = parseInt(id, 10)
  if (isNaN(obraId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  const auth = await getUserAndRole(supabase, obraId)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  try {
    await deletarApontamento(supabase, apontamentoId, auth.role)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    const status = msg.includes('permissão') ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
