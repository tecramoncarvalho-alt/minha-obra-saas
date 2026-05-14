import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getApontamentosDoDia } from '@/app/lib/apontamentos'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // service_role apenas no servidor para resolver o token → obra_id
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: obra } = await admin
    .from('obras')
    .select('id, nome, data_inicio, data_fim, sabado_util, domingo_util, foto_url')
    .eq('tv_token', token)
    .maybeSingle()

  // Resposta genérica — não revela se token existe ou não
  if (!obra) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 })
  }

  // Buscar pavimentos filtrados por obra_id
  const { data: pavimentos } = await admin
    .from('pavimentos')
    .select('id, nome, numero')
    .eq('obra_id', obra.id)
    .order('numero', { ascending: false })

  if (!pavimentos?.length) {
    return NextResponse.json({ obra, pavimentos: [], atividades: [], apontamentos: [] })
  }

  const pavimentoIds = pavimentos.map(p => p.id)

  // Buscar atividades filtradas pelos pavimentos da obra
  const { data: atividades } = await admin
    .from('atividades')
    .select('id, pavimento_id, nome, data_inicio, data_fim, equipe, efetivo, linha_index')
    .in('pavimento_id', pavimentoIds)

  if (!atividades?.length) {
    return NextResponse.json({ obra, pavimentos, atividades: [], apontamentos: [] })
  }

  const atividadeIds = atividades.map(a => a.id)

  // Apontamentos dos últimos 30 dias para exibir o progresso mais recente de cada atividade
  const pad = (n: number) => String(n).padStart(2, '0')
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
  const dataInicio = `${trintaDiasAtras.getFullYear()}-${pad(trintaDiasAtras.getMonth() + 1)}-${pad(trintaDiasAtras.getDate())}`
  const hj = new Date()
  const hoje = `${hj.getFullYear()}-${pad(hj.getMonth() + 1)}-${pad(hj.getDate())}`

  const { data: apontamentos } = await admin
    .from('apontamentos_diarios')
    .select('atividade_id, data, efetivo_real, percentual_executado, status')
    .in('atividade_id', atividadeIds)
    .gte('data', dataInicio)
    .lte('data', hoje)
    .order('data', { ascending: false })

  // Não expor empresa_id, tv_token nem outros IDs sensíveis
  return NextResponse.json({
    obra: {
      id: obra.id,
      nome: obra.nome,
      data_inicio: obra.data_inicio,
      data_fim: obra.data_fim,
    },
    pavimentos,
    atividades,
    apontamentos: apontamentos ?? [],
  })
}
