import { useMemo } from 'react'
import type { ApontamentoDiario } from '@/app/lib/types'
import { estaNoIntervalo, type DashboardAtividade, type ItemEfetivo } from '../utils'

export function useEfetivo(
  atividades: DashboardAtividade[],
  apontamentosHoje: ApontamentoDiario[],
  dataSelecionada: string,
  enabled = true,
) {
  const atividadesDoDia = useMemo(() => {
    if (!enabled) return []
    return atividades.filter(a => estaNoIntervalo(dataSelecionada, a.data_inicio, a.data_fim))
  }, [enabled, atividades, dataSelecionada])

  const efetivoPorEquipe = useMemo((): ItemEfetivo[] => {
    if (!enabled) return []
    const mapa: Record<string, ItemEfetivo> = {}
    const garantirEquipe = (chave: string) => {
      if (!mapa[chave]) mapa[chave] = { equipe: chave, efetivo: 0, atividades: [] }
    }

    atividadesDoDia.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento'

      if (at.subatividades && at.subatividades.length > 0) {
        const subsPorEquipe: Record<string, { efetivo: number; nomes: string[] }> = {}
        at.subatividades.forEach(sub => {
          const equipeChave = (sub.equipe?.trim()) || (at.equipe?.trim()) || 'Sem equipe'
          if (!subsPorEquipe[equipeChave]) subsPorEquipe[equipeChave] = { efetivo: 0, nomes: [] }
          if (sub.efetivo && sub.efetivo > 0) subsPorEquipe[equipeChave].efetivo += sub.efetivo
          subsPorEquipe[equipeChave].nomes.push(sub.nome)
        })
        Object.entries(subsPorEquipe).forEach(([equipeChave, dados]) => {
          garantirEquipe(equipeChave)
          mapa[equipeChave].efetivo += dados.efetivo
          mapa[equipeChave].atividades.push({ nome: at.nome, pavimento: nomePav, subNome: dados.nomes.join(', ') })
        })
      } else {
        const equipeChave = at.equipe?.trim() || 'Sem equipe'
        garantirEquipe(equipeChave)
        if (at.efetivo && at.efetivo > 0) mapa[equipeChave].efetivo += at.efetivo
        mapa[equipeChave].atividades.push({
          nome: at.nome, pavimento: nomePav,
          subNome: at.efetivo ? `${at.efetivo} func.` : undefined,
        })
      }
    })

    return Object.values(mapa).sort((a, b) => {
      if (b.efetivo !== a.efetivo) return b.efetivo - a.efetivo
      return a.equipe.localeCompare(b.equipe)
    })
  }, [enabled, atividadesDoDia])

  const equipesAtivas = useMemo(() => {
    if (!enabled) return 0
    const set = new Set<string>()
    atividadesDoDia.forEach(at => {
      if (at.subatividades && at.subatividades.length > 0) {
        at.subatividades.forEach(s => {
          const eq = s.equipe?.trim() || at.equipe?.trim()
          if (eq) set.add(eq)
        })
      } else if (at.equipe?.trim()) {
        set.add(at.equipe.trim())
      }
    })
    return set.size
  }, [atividadesDoDia])

  const avancoRealHoje = useMemo(() => {
    if (!enabled || !apontamentosHoje.length) return null
    const soma = apontamentosHoje.reduce((acc, a) => acc + a.percentual_executado, 0)
    return Math.round(soma / apontamentosHoje.length)
  }, [apontamentosHoje])

  const efetivoRealHoje = useMemo(
    () => !enabled ? 0 : apontamentosHoje.reduce((acc, a) => acc + a.efetivo_real, 0),
    [enabled, apontamentosHoje]
  )

  const atividadesSemApontamento = useMemo(() => {
    if (!enabled) return []
    const idsComApontamento = new Set(apontamentosHoje.map(a => a.atividade_id))
    return atividadesDoDia.filter(at => !idsComApontamento.has(at.id))
  }, [enabled, apontamentosHoje, atividadesDoDia])

  return {
    atividadesDoDia,
    efetivoPorEquipe,
    equipesAtivas,
    avancoRealHoje,
    efetivoRealHoje,
    atividadesSemApontamento,
  }
}
