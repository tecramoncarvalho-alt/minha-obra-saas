import { useMemo } from 'react'
import type { ApontamentoDiario, Atividade as LibAtividade } from '@/app/lib/types'
import type { ConfigCalendario } from '@/app/calendario'
import { gerarResumoAvancoObra, gerarDesviosPorAtividade, calcularCurvaS } from '@/app/lib/calculador-avanco'
import type { DashboardAtividade, DashboardObra, AtividadeParalisada } from '../utils'

export function useKPIs(
  atividades: DashboardAtividade[],
  atividadesDoDia: DashboardAtividade[],
  todosApontamentos: ApontamentoDiario[],
  config: ConfigCalendario,
  dataSelecionada: string,
  obra: DashboardObra | null,
  enabled = true,
) {
  const resumo = useMemo(() => {
    if (!enabled || !obra || atividades.length === 0) return null
    return gerarResumoAvancoObra(
      obra as import('@/app/lib/types').Obra,
      atividades as LibAtividade[],
      todosApontamentos,
      config,
      dataSelecionada
    )
  }, [obra, atividades, todosApontamentos, config, dataSelecionada])

  const desvios = useMemo(() => {
    if (!enabled) return []
    return gerarDesviosPorAtividade(
      atividadesDoDia as LibAtividade[],
      todosApontamentos,
      config,
      dataSelecionada
    )
  }, [enabled, atividadesDoDia, todosApontamentos, config, dataSelecionada])

  const paralisadas = useMemo((): AtividadeParalisada[] => {
    if (!enabled) return []
    const porAtividade = new Map<number, ApontamentoDiario>()
    for (const ap of todosApontamentos) {
      const atual = porAtividade.get(ap.atividade_id)
      if (!atual || ap.data > atual.data) porAtividade.set(ap.atividade_id, ap)
    }
    return atividades
      .filter(at => porAtividade.get(at.id)?.status === 'PARALISADA')
      .map(at => ({
        id: at.id,
        nome: at.nome,
        pavimentoNome: at.pavimento?.nome ?? 'Desconhecido',
        ultimoApontamento: porAtividade.get(at.id)!,
      }))
  }, [enabled, atividades, todosApontamentos])

  const historicoPorAtividade = useMemo(() => {
    if (!enabled) return {} as Record<number, ApontamentoDiario[]>
    const mapa: Record<number, ApontamentoDiario[]> = {}
    for (const ap of todosApontamentos) {
      if (!mapa[ap.atividade_id]) mapa[ap.atividade_id] = []
      mapa[ap.atividade_id].push(ap)
    }
    return mapa
  }, [enabled, todosApontamentos])

  const itensAtencao = useMemo(() => {
    if (!enabled) return []
    const porAtividade = new Map<number, ApontamentoDiario>()
    for (const ap of todosApontamentos) {
      const atual = porAtividade.get(ap.atividade_id)
      if (!atual || ap.data > atual.data) porAtividade.set(ap.atividade_id, ap)
    }
    return desvios
      .map(d => {
        const at = atividadesDoDia.find(a => a.id === d.atividade_id)
        if (!at) return null
        return {
          atividade: { ...at, pavimentoNome: at.pavimento?.nome ?? '' } as LibAtividade & { pavimentoNome: string },
          desvio: d,
          ultimoApontamento: porAtividade.get(d.atividade_id),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [enabled, desvios, atividadesDoDia, todosApontamentos])

  const dadosCurvaS = useMemo(() => {
    if (!enabled || !obra?.data_inicio || !obra?.data_fim || atividades.length === 0) return []
    const [y1, m1, d1] = obra.data_inicio.split('-').map(Number)
    const [y2, m2, d2] = obra.data_fim.split('-').map(Number)
    return calcularCurvaS(
      atividades as LibAtividade[],
      todosApontamentos,
      new Date(y1, m1 - 1, d1),
      new Date(y2, m2 - 1, d2),
      config
    )
  }, [enabled, obra, atividades, todosApontamentos, config])

  return { resumo, desvios, paralisadas, historicoPorAtividade, itensAtencao, dadosCurvaS }
}
