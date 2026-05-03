'use client'

import type { ApontamentoDiario, DesvioAtividade, DeltaEfetivo } from '@/app/lib/types'
import { formatarDesvioPrazo } from '@/app/lib/calculador-avanco'

const STATUS_LABELS: Record<string, string> = {
  NAO_INICIADA: 'Não Iniciada',
  INICIADA: 'Iniciada',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA_NO_DIA: 'Concluída',
  PARALISADA: 'Paralisada',
}

const STATUS_CORES: Record<string, string> = {
  NAO_INICIADA: 'bg-gray-100 text-gray-600',
  INICIADA: 'bg-blue-100 text-blue-700',
  EM_ANDAMENTO: 'bg-indigo-100 text-indigo-700',
  CONCLUIDA_NO_DIA: 'bg-green-100 text-green-700',
  PARALISADA: 'bg-red-100 text-red-700',
}

function fmtData(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

interface Props {
  pavimentoNome: string
  desvio: DesvioAtividade
  delta: DeltaEfetivo
  ultimoApontamento?: ApontamentoDiario
  onClick?: () => void
}

export function RowHighlight({ pavimentoNome, desvio, delta, ultimoApontamento, onClick }: Props) {
  const desvioStr = formatarDesvioPrazo(desvio.desvio_percentual, Math.max(1, desvio.dias_atraso > 0 ? desvio.dias_atraso : 1))
  const status = desvio.status_apontamento

  return (
    <div
      className={`px-4 py-3 flex flex-wrap items-center gap-3 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${
        desvio.status_apontamento === 'PARALISADA' ? 'bg-red-50' : ''
      }`}
      onClick={onClick}
    >
      {/* Atividade + pavimento */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{desvio.nome_atividade}</p>
        <p className="text-xs text-gray-400 truncate">{pavimentoNome}</p>
      </div>

      {/* Progresso % */}
      <div className="flex items-center gap-1 text-xs flex-shrink-0">
        <span className="text-gray-500">{desvio.percentual_previsto}% prev.</span>
        <span className="text-gray-300">·</span>
        <span className={desvio.desvio_percentual < -5 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
          {desvio.percentual_real}% real
        </span>
      </div>

      {/* Desvio prazo */}
      <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
        desvio.desvio_percentual < -5
          ? 'bg-red-100 text-red-700'
          : desvio.desvio_percentual > 5
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-600'
      }`}>
        {desvio.desvio_percentual >= 0 ? '+' : ''}{desvio.desvio_percentual}% ({desvioStr})
      </span>

      {/* Δ Efetivo */}
      {delta.previsto > 0 && (
        <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
          delta.critico ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          👷 {delta.real}/{delta.previsto}
          {delta.critico && ' ⚠️'}
        </span>
      )}

      {/* Status badge */}
      {status && (
        <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${STATUS_CORES[status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[status] ?? status}
        </span>
      )}

      {/* Data medição */}
      {ultimoApontamento && (
        <span className="text-xs text-gray-400 flex-shrink-0">{fmtData(ultimoApontamento.data)}</span>
      )}

      <span className="text-gray-300 text-xs flex-shrink-0">›</span>
    </div>
  )
}
