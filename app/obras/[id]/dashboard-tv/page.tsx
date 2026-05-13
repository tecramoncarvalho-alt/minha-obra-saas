'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers'
import DashboardTV, { type TVData } from './components/DashboardTV'
import SharePanel from './components/SharePanel'
import type { TVAtividade, TVPavimento, TVApontamento } from './components/LinhaBalancoTV'

export default function DashboardTVPage() {
  const { id } = useParams<{ id: string }>()
  const obraId = Number(id)
  const { role } = useAuth()
  const podeVerSharePanel = role === 'admin' || role === 'planejador'

  const [data, setData] = useState<TVData | null>(null)
  const [tvToken, setTvToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    // Busca obra + tv_token
    const { data: obra, error: eObra } = await supabase
      .from('obras')
      .select('id, nome, tv_token')
      .eq('id', obraId)
      .single()

    if (eObra || !obra) {
      setErro('Obra não encontrada.')
      setLoading(false)
      return
    }

    setTvToken((obra as { tv_token?: string | null }).tv_token ?? null)

    // Busca pavimentos
    const { data: pavRaw } = await supabase
      .from('pavimentos')
      .select('id, nome, numero')
      .eq('obra_id', obraId)
      .order('numero', { ascending: false })

    const pavimentos = (pavRaw ?? []) as TVPavimento[]

    if (!pavimentos.length) {
      setData({ obra: { id: obra.id, nome: obra.nome }, pavimentos: [], atividades: [], apontamentos: [] })
      setLoading(false)
      return
    }

    const pavimentoIds = pavimentos.map(p => p.id)

    // Busca atividades
    const { data: atRaw } = await supabase
      .from('atividades')
      .select('id, pavimento_id, nome, data_inicio, data_fim, equipe, efetivo, linha_index')
      .in('pavimento_id', pavimentoIds)

    const atividades = (atRaw ?? []) as TVAtividade[]

    if (!atividades.length) {
      setData({ obra: { id: obra.id, nome: obra.nome }, pavimentos, atividades: [], apontamentos: [] })
      setLoading(false)
      return
    }

    const atividadeIds = atividades.map(a => a.id)

    // Apontamentos dos últimos 30 dias
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
    const dataInicio = trintaDiasAtras.toISOString().slice(0, 10)
    const hoje = new Date().toISOString().slice(0, 10)

    const { data: apRaw } = await supabase
      .from('apontamentos_diarios')
      .select('atividade_id, data, efetivo_real, percentual_executado, status')
      .in('atividade_id', atividadeIds)
      .gte('data', dataInicio)
      .lte('data', hoje)
      .order('data', { ascending: false })

    setData({
      obra: { id: obra.id, nome: obra.nome },
      pavimentos,
      atividades,
      apontamentos: (apRaw ?? []) as TVApontamento[],
    })
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleTokenRefreshed() {
    const supabase = createClient()
    const { data: obraAtualizada } = await supabase
      .from('obras')
      .select('tv_token')
      .eq('id', obraId)
      .single()
    setTvToken((obraAtualizada as { tv_token?: string | null } | null)?.tv_token ?? null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400 text-lg">
        Carregando dashboard…
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400 text-lg">
        {erro || 'Erro ao carregar dados.'}
      </div>
    )
  }

  return (
    <DashboardTV data={data} onRefresh={fetchData}>
      {podeVerSharePanel && (
        <SharePanel
          tvToken={tvToken}
          obraId={obraId}
          onTokenRefreshed={handleTokenRefreshed}
        />
      )}
    </DashboardTV>
  )
}
