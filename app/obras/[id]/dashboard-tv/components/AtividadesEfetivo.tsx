'use client'

import type { TVAtividade, TVPavimento, TVApontamento } from './LinhaBalancoTV'

interface Props {
  atividades: TVAtividade[]
  pavimentos: TVPavimento[]
  apontamentos: TVApontamento[]
}

function corEfetivo(pct: number) {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getSemanaAtual(): [string, string] {
  const hoje = new Date()
  const diaSemana = hoje.getDay()
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana
  const segunda = new Date(hoje)
  segunda.setDate(hoje.getDate() + diffSegunda)
  const domingo = new Date(segunda)
  domingo.setDate(segunda.getDate() + 6)
  return [segunda.toISOString().slice(0, 10), domingo.toISOString().slice(0, 10)]
}

export default function AtividadesEfetivo({ atividades, pavimentos, apontamentos }: Props) {
  const [segStr, domStr] = getSemanaAtual()
  const hojeStr = new Date().toISOString().slice(0, 10)

  const pavMap = new Map(pavimentos.map(p => [p.id, p]))

  // Mapa: atividadeId → apontamento mais recente
  const ultApontamento = new Map<number, TVApontamento>()
  for (const ap of apontamentos) {
    if (!ultApontamento.has(ap.atividade_id)) {
      ultApontamento.set(ap.atividade_id, ap)
    }
  }

  // Apontamentos de hoje (para marcar sem apontamento hoje)
  const apHoje = new Set(
    apontamentos.filter(a => a.data === hojeStr).map(a => a.atividade_id)
  )

  // Atividades ativas na semana
  const atividadesSemana = atividades.filter(
    a => a.data_inicio <= domStr && a.data_fim >= segStr
  )

  // Totais de efetivo
  const totalEfetivoPrevisto = atividadesSemana.reduce((acc, a) => acc + (a.efetivo ?? 0), 0)
  const totalEfetivoReal = atividadesSemana.reduce((acc, a) => {
    const ap = ultApontamento.get(a.id)
    return acc + (ap?.efetivo_real ?? 0)
  }, 0)
  const pctTotal = totalEfetivoPrevisto > 0
    ? Math.round((totalEfetivoReal / totalEfetivoPrevisto) * 100)
    : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Card de resumo */}
      <div className="flex-shrink-0 m-3 p-4 bg-gray-800 rounded-xl border border-gray-700">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total na obra agora</div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-white">{totalEfetivoReal}</span>
          <span className="text-lg text-gray-400 mb-0.5">/ {totalEfetivoPrevisto} 👷</span>
        </div>
        <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${corEfetivo(pctTotal)}`}
            style={{ width: `${Math.min(pctTotal, 100)}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-1">{pctTotal}% de aderência</div>
      </div>

      {/* Lista de atividades */}
      <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-2">
        {atividadesSemana.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Nenhuma atividade na semana
          </div>
        )}
        {atividadesSemana.map(at => {
          const pav = pavMap.get(at.pavimento_id)
          const ap = ultApontamento.get(at.id)
          const efetivoReal = ap?.efetivo_real ?? 0
          const efetivoPrev = at.efetivo ?? 0
          const pctEfetivo = efetivoPrev > 0 ? Math.round((efetivoReal / efetivoPrev) * 100) : 0
          const semApontamentoHoje = !apHoje.has(at.id)

          const nomePav = pav
            ? (pav.nome.includes(' - ') ? pav.nome : pav.nome)
            : ''

          return (
            <div
              key={at.id}
              className={`p-3 rounded-lg border ${
                semApontamentoHoje
                  ? 'bg-red-950/30 border-red-800/60'
                  : 'bg-gray-800/60 border-gray-700/60'
              }`}
            >
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-100 truncate">{at.nome}</div>
                  <div className="text-xs text-gray-400 truncate">{nomePav}</div>
                  {at.equipe && (
                    <div className="text-xs text-gray-500">{at.equipe}</div>
                  )}
                </div>
                <div className="text-sm font-bold text-gray-200 ml-2 whitespace-nowrap flex-shrink-0">
                  {efetivoReal}/{efetivoPrev} 👷
                </div>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${corEfetivo(pctEfetivo)}`}
                  style={{ width: `${Math.min(pctEfetivo, 100)}%` }}
                />
              </div>
              {semApontamentoHoje && (
                <div className="text-xs text-red-400 mt-1">Sem apontamento hoje</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
