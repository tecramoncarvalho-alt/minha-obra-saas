import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getApontamentosDoDia,
  getApontamentosAtividade,
  salvarApontamento,
} from '@/app/lib/apontamentos'
import { ApontamentoDiarioSchema } from '@/app/lib/schemas'

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

  // Obtém empresa_id da obra
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
  return { user, role: membership.role as string, empresa_id: obra.empresa_id as string }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const obraId = parseInt(id, 10)
  if (isNaN(obraId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  const auth = await getUserAndRole(supabase, obraId)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const data = searchParams.get('data')
  const dataInicio = searchParams.get('dataInicio')
  const dataFim = searchParams.get('dataFim')
  const atividadeId = searchParams.get('atividadeId')

  let apontamentos

  if (atividadeId) {
    apontamentos = await getApontamentosAtividade(
      supabase,
      parseInt(atividadeId, 10),
      dataInicio ?? undefined,
      dataFim ?? undefined
    )
  } else {
    const dataAlvo = data ?? new Date().toISOString().slice(0, 10)
    apontamentos = await getApontamentosDoDia(supabase, obraId, dataAlvo)
  }

  const totalEfetivo = apontamentos.reduce((acc, a) => acc + a.efetivo_real, 0)
  const mediaAvanco = apontamentos.length
    ? Math.round(apontamentos.reduce((acc, a) => acc + a.percentual_executado, 0) / apontamentos.length)
    : 0

  return NextResponse.json({ apontamentos, totalEfetivo, mediaAvanco })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const obraId = parseInt(id, 10)
  if (isNaN(obraId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  const auth = await getUserAndRole(supabase, obraId)
  if (!auth) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const body = await request.json()
  const result = ApontamentoDiarioSchema.safeParse(body)
  if (!result.success) {
    const mensagens = result.error.issues.map(i => i.message).join('; ')
    return NextResponse.json({ error: mensagens }, { status: 400 })
  }

  const { atividade_id, data, efetivo_real, percentual_executado, status, observacao, responsavel } = result.data

  try {
    const apontamento = await salvarApontamento(
      supabase,
      { atividade_id, data, efetivo_real, percentual_executado, status, observacao, responsavel, created_by: auth.user.id },
      auth.role
    )
    return NextResponse.json({ apontamento }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
