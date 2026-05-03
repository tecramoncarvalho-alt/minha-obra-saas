'use client'

import type { Atividade, ApontamentoDiario, DesvioAtividade } from '@/app/lib/types'
import { calcularDeltaEfetivo } from '@/app/lib/calculador-avanco'

interface Props {
  atividades: Atividade[]
  apontamentosHoje: ApontamentoDiario[]
  desvios: DesvioAtividade[]
}

export function GridEfetivo({ atividades, apontamentosHoje, desvios }: Props) {
  if (atividades.length === 0) return null

  const porAtividade = new Map(apontamentosHoje.map(a => [a.atividade_id, a]))
  const desvioMap = new Map(desvios.map(d => [d.atividade_id, d]))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Efetivo Previsto vs Real — Hoje</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {atividades.map(at => {
          const ap = porAtividade.get(at.id)
          const delta = calcularDeltaEfetivo(at.efetivo ?? 0, ap)
          const desvio = desvioMap.get(at.id)

          return (
            <div key={at.id} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{at.nome}</p>
                {at.equipe && (
                  <p className="text-xs text-gray-400">{at.equipe}</p>
                )}
              </div>

              {/* Efetivo previsto vs real */}
              <div className="flex items-center gap-2 text-sm flex-shrink-0">
                <span className="text-gray-500">{delta.previsto} prev.</span>
                <span className="text-gray-300">·</span>
                <span className={delta.critico ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                  {delta.real} real
                </span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  delta.delta < 0
                    ? 'bg-red-100 text-red-700'
                    : delta.delta > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {delta.delta >= 0 ? '+' : ''}{delta.delta}
                  {delta.critico && ' ⚠️'}
                </span>
              </div>

              {/* Barras de progresso duplas */}
              {desvio && (
                <div className="w-32 flex-shrink-0">
                  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                    {/* Barra planejado */}
                    <div
                      className="absolute inset-y-0 left-0 bg-blue-200 rounded-full"
                      style={{ width: `${desvio.percentual_previsto}%` }}
                      title={`Previsto: ${desvio.percentual_previsto}%`}
                    />
                    {/* Barra real (sobreposta) */}
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                        desvio.desvio_percentual < -10 ? 'bg-red-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${desvio.percentual_real}%`, height: '50%', top: '25%' }}
                      title={`Real: ${desvio.percentual_real}%`}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>{desvio.percentual_previsto}%</span>
                    <span className={desvio.desvio_percentual < 0 ? 'text-red-500' : 'text-green-600'}>
                      {desvio.percentual_real}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
