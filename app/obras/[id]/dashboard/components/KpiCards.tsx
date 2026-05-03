'use client'

import type { ResumoAvancoObra } from '@/app/lib/types'
import { formatarDesvioPrazo } from '@/app/lib/calculador-avanco'

interface Props {
  resumo: ResumoAvancoObra
}

function cor(condicao: boolean, ok: string, ruim: string) {
  return condicao ? ok : ruim
}

export function KpiCards({ resumo }: Props) {
  const desvioFormatado = formatarDesvioPrazo(
    resumo.avanço_previsto - resumo.avanço_real,
    // Estimativa: se previsto > real, é atraso; usar desvio em % como proxy
    Math.max(1, resumo.dias_atraso_geral > 0 ? resumo.dias_atraso_geral * 2 : 10)
  )
  const isAtrasado = resumo.avanço_real < resumo.avanço_previsto
  const criticasCount = resumo.atividades_atrasadas.filter(d => d.dias_atraso > 5).length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* % Conclusão Geral */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Conclusão Geral</p>
        <p className="text-3xl font-bold text-gray-900">{resumo.percentual_conclusao_geral}%</p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all"
            style={{ width: `${resumo.percentual_conclusao_geral}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">Previsto: {resumo.avanço_previsto}%</p>
      </div>

      {/* Desvio Geral */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Desvio Geral</p>
        <p className={`text-2xl font-bold ${isAtrasado ? 'text-red-600' : 'text-green-600'}`}>
          {isAtrasado ? `${resumo.dias_atraso_geral} dias úteis` : 'No prazo'}
        </p>
        <p className={`text-xs mt-1 ${isAtrasado ? 'text-red-400' : 'text-green-400'}`}>
          {isAtrasado ? `Atraso: -${desvioFormatado.replace('-', '')}` : `Adiantamento: +${resumo.avanço_real - resumo.avanço_previsto}%`}
        </p>
      </div>

      {/* Aderência de Efetivo */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Aderência Efetivo</p>
        <p className={`text-3xl font-bold ${cor(resumo.aderencia_efetivo >= 80, 'text-green-600', 'text-red-600')}`}>
          {resumo.aderencia_efetivo}%
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {resumo.efetivo_real_total} real · {resumo.efetivo_previsto_total} prev.
        </p>
      </div>

      {/* Atividades Críticas */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Críticas Atrasadas</p>
        <div className="flex items-end gap-2">
          <p className={`text-3xl font-bold ${cor(criticasCount === 0, 'text-green-600', 'text-red-600')}`}>
            {criticasCount}
          </p>
          {criticasCount > 0 && (
            <span className="text-xs text-red-500 mb-1">&gt; 5 dias úteis</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {resumo.atividades_atrasadas.length} atrasadas no total
        </p>
      </div>
    </div>
  )
}
