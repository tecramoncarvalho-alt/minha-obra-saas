'use client'

import { getCor } from '@/app/obras/[id]/linha-balanco/utils/geradorCores'
import type { TVAtividade, TVPavimento, TVApontamento } from './LinhaBalancoTV'

interface Props {
  atividades: TVAtividade[]
  pavimentos: TVPavimento[]
  apontamentos: TVApontamento[]
}

function dotColor(pct: number) {
  if (pct === 0) return 'bg-red-500'
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function EquipesPanel({ atividades, pavimentos, apontamentos }: Props) {
  const hojeStr = new Date().toISOString().slice(0, 10)
  const pavMap = new Map(pavimentos.map(p => [p.id, p]))

  // Mapa: atividadeId → apontamento mais recente (para verificar % concluído)
  const ultApontamento = new Map<number, TVApontamento>()
  for (const ap of apontamentos) {
    if (!ultApontamento.has(ap.atividade_id)) {
      ultApontamento.set(ap.atividade_id, ap)
    }
  }

  // Apontamento de hoje por atividade (para efetivo_real do dia)
  const apHojeMap = new Map<number, TVApontamento>()
  for (const ap of apontamentos) {
    if (ap.data === hojeStr && !apHojeMap.has(ap.atividade_id)) {
      apHojeMap.set(ap.atividade_id, ap)
    }
  }

  // Atividades planejadas para hoje, excluindo 100% concluídas
  const atividadesHoje = atividades.filter(a => {
    if (a.data_inicio > hojeStr || a.data_fim < hojeStr) return false
    const pct = ultApontamento.get(a.id)?.percentual_executado ?? 0
    return pct < 100
  })

  // Agrupar por equipe
  const porEquipe = new Map<string, TVAtividade[]>()
  for (const at of atividadesHoje) {
    const equipe = at.equipe ?? 'Sem equipe'
    const lista = porEquipe.get(equipe) ?? []
    lista.push(at)
    porEquipe.set(equipe, lista)
  }

  const equipes = Array.from(porEquipe.entries()).sort(([a], [b]) => a.localeCompare(b))

  if (!equipes.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-lg">
        Sem equipes planejadas para hoje
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full p-3 space-y-3">
      {equipes.map(([equipe, ats]) => {
        const cor = getCor(equipe)
        const prevTotal = ats.reduce((acc, a) => acc + (a.efetivo ?? 0), 0)
        const realTotal = ats.reduce((acc, a) => {
          const ap = apHojeMap.get(a.id)
          return acc + (ap?.efetivo_real ?? 0)
        }, 0)
        const pct = prevTotal > 0 ? Math.round((realTotal / prevTotal) * 100) : 0
        const efeitoZero = realTotal === 0

        return (
          <div
            key={equipe}
            className={`rounded-xl border overflow-hidden ${
              efeitoZero
                ? 'border-red-800/60 bg-red-950/20'
                : 'border-gray-700/60 bg-gray-800/60'
            }`}
          >
            {/* Header da equipe */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40"
              style={{ borderLeftWidth: 3, borderLeftColor: cor }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(pct)}`}
                />
                <span className="font-semibold text-sm text-gray-100 truncate">{equipe}</span>
              </div>
              <span className="text-sm font-bold text-gray-300 ml-2 flex-shrink-0 whitespace-nowrap">
                {realTotal}/{prevTotal} 👷
              </span>
            </div>

            {/* Atividades da equipe */}
            <div className="divide-y divide-gray-700/30">
              {ats.map(at => {
                const pav = pavMap.get(at.pavimento_id)
                const nomePav = pav?.nome ?? ''
                const partePav = nomePav.includes(' - ') ? nomePav.split(' - ')[1] : nomePav
                const blocoNome = nomePav.includes(' - ') ? nomePav.split(' - ')[0] : ''

                return (
                  <div key={at.id} className="px-3 py-1.5">
                    <div className="text-sm text-gray-200 truncate">{at.nome}</div>
                    {pav && (
                      <div className="text-xs text-gray-500 truncate">
                        {blocoNome && <span className="text-gray-400">{blocoNome} — </span>}
                        {partePav}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
