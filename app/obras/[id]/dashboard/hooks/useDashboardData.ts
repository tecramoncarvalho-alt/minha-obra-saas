'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ApontamentoDiario } from '@/app/lib/types'
import {
  hoje,
  type DashboardObra,
  type DashboardFeriado,
  type DashboardPavimento,
  type DashboardSubatividade,
  type DashboardAtividade,
  type DashboardVersao,
} from '../utils'

export function useDashboardData(obraId: number) {
  const [obra, setObra] = useState<DashboardObra | null>(null)
  const [pavimentos, setPavimentos] = useState<DashboardPavimento[]>([])
  const [atividades, setAtividades] = useState<DashboardAtividade[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSelecionada, setDataSelecionada] = useState(hoje())
  const [versoes, setVersoes] = useState<DashboardVersao[]>([])
  const [versaoSelecionada, setVersaoSelecionada] = useState<DashboardVersao | null>(null)
  const [modoVersao, setModoVersao] = useState(false)
  const [apontamentosHoje, setApontamentosHoje] = useState<ApontamentoDiario[]>([])
  const [todosApontamentos, setTodosApontamentos] = useState<ApontamentoDiario[]>([])
  const [feriados, setFeriados] = useState<DashboardFeriado[]>([])

  const supabase = createClient()

  useEffect(() => { void Promise.all([fetchDados(), fetchVersoes(), fetchApontamentosHoje()]) }, [obraId])

  useEffect(() => {
    if (!modoVersao || !versaoSelecionada) return
    const ids = (versaoSelecionada.snapshot.pavimentos as { atividades?: { id: number }[] }[]).flatMap(pav =>
      (pav.atividades || []).map(at => at.id)
    )
    if (ids.length === 0) { setTodosApontamentos([]); return }
    supabase
      .from('apontamentos_diarios')
      .select('*')
      .in('atividade_id', ids)
      .order('data', { ascending: true })
      .then(({ data }: { data: ApontamentoDiario[] | null }) => setTodosApontamentos(data || []))
  }, [modoVersao, versaoSelecionada])

  const fetchApontamentosHoje = async () => {
    try {
      const res = await fetch(`/api/obras/${obraId}/apontamentos?data=${hoje()}`)
      if (res.ok) {
        const { apontamentos } = await res.json()
        setApontamentosHoje(apontamentos)
      }
    } catch {
      // Apontamentos não críticos — não bloqueia o dashboard
    }
  }

  const fetchVersoes = async () => {
    const { data } = await supabase
      .from('versoes').select('id,nome,status,descricao,created_at,snapshot').eq('obra_id', obraId)
      .order('created_at', { ascending: false })
    if (data && data.length > 0) {
      setVersoes(data as DashboardVersao[])
      const definitiva = (data as DashboardVersao[]).find(v => v.status === 'Definitiva')
      if (definitiva) { setVersaoSelecionada(definitiva); setModoVersao(true) }
    }
  }

  const atividadesEfetivas = useMemo((): DashboardAtividade[] => {
    if (modoVersao && versaoSelecionada) {
      return (versaoSelecionada.snapshot.pavimentos as Record<string, unknown>[]).flatMap(pav =>
        ((pav.atividades as DashboardAtividade[]) || []).map(at => ({
          ...at,
          subatividades: (at.subatividades || []) as DashboardSubatividade[],
          pavimento: {
            id: Number(pav.id), nome: String(pav.nome),
            numero: pav.numero as number | null, obra_id: obraId,
          },
        }))
      )
    }
    return atividades
  }, [modoVersao, versaoSelecionada, atividades, obraId])

  const fetchDados = async () => {
    try {
      setLoading(true)

      const [obraResult, ferResult, pavResult] = await Promise.all([
        supabase.from('obras')
          .select('id,nome,data_inicio,data_fim,foto_url,sabado_util,domingo_util').eq('id', obraId).single(),
        supabase.from('feriados').select('id,data,nome').eq('obra_id', obraId),
        supabase.from('pavimentos')
          .select('id,nome,numero,observacao,obra_id').eq('obra_id', obraId),
      ])
      if (obraResult.data) setObra(obraResult.data)
      setFeriados(ferResult.data || [])
      setPavimentos(pavResult.data || [])

      const pavIds = (pavResult.data || []).map((p: DashboardPavimento) => p.id)
      if (pavIds.length === 0) { setLoading(false); return }

      const { data: atData, error: atError } = await supabase
        .from('atividades')
        .select('id,nome,data_inicio,data_fim,duracao_dias,equipe,efetivo,linha_index,vinculo_id,vinculo_ordem,pavimento_id')
        .in('pavimento_id', pavIds)

      if (atError) { console.error('Erro ao buscar atividades:', atError); setLoading(false); return }

      console.log('Atividades encontradas:', atData?.length, atData)

      const atIds = (atData || []).map((a: DashboardAtividade) => a.id)

      let subData: DashboardSubatividade[] = []
      let aponData: ApontamentoDiario[] = []
      if (atIds.length > 0) {
        const [subResult, aponResult] = await Promise.all([
          supabase.from('subatividades')
            .select('id,atividade_id,nome,duracao,equipe,efetivo,ordem')
            .in('atividade_id', atIds)
            .order('ordem'),
          supabase.from('apontamentos_diarios')
            .select('*')
            .in('atividade_id', atIds)
            .order('data', { ascending: true }),
        ])
        if (subResult.error) { console.warn('Subatividades não disponíveis:', subResult.error.message) }
        else { subData = subResult.data || [] }
        aponData = aponResult.data || []
      }

      console.log('Subatividades encontradas:', subData.length, subData)

      setTodosApontamentos(aponData)
      const pavMap = Object.fromEntries((pavResult.data || []).map((p: DashboardPavimento) => [p.id, p]))
      const subMap: Record<number, DashboardSubatividade[]> = {}
      subData.forEach(s => {
        if (!subMap[s.atividade_id]) subMap[s.atividade_id] = []
        subMap[s.atividade_id].push(s)
      })

      const ativsCompletas: DashboardAtividade[] = (atData || []).map((a: DashboardAtividade) => ({
        ...a,
        equipe: a.equipe ?? null,
        efetivo: a.efetivo ?? null,
        subatividades: (subMap[a.id] || []).map(s => ({ ...s, equipe: s.equipe ?? null, efetivo: s.efetivo ?? null })),
        pavimento: pavMap[a.pavimento_id],
      }))

      console.log('Atividades completas montadas:', ativsCompletas.length)
      setAtividades(ativsCompletas)
    } catch (err) {
      console.error('Erro geral no fetchDados:', err)
    } finally {
      setLoading(false)
    }
  }

  return {
    obra, pavimentos, atividadesEfetivas, feriados,
    versoes, versaoSelecionada, setVersaoSelecionada,
    modoVersao, setModoVersao,
    dataSelecionada, setDataSelecionada,
    apontamentosHoje, todosApontamentos,
    loading,
  }
}
