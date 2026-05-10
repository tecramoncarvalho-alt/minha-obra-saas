'use client'

import { KpiCards } from '../components/KpiCards'
import { KpiCardsTemporais } from '../components/KpiCardsTemporais'
import { SectionAlertas } from '../sections/SectionAlertas'
import { SectionCurvaS } from '../sections/SectionCurvaS'
import type { ResumoAvancoObra, CurvaSPoint } from '@/app/lib/types'
import type { DashboardObra, AtividadeParalisada } from '../utils'
import type { KPIsTemporais } from '../hooks/useKPIsTemporais'

interface Props {
  resumo: ResumoAvancoObra | null
  paralisadas: AtividadeParalisada[]
  dadosCurvaS: CurvaSPoint[]
  kpisTemporais: KPIsTemporais
  obra: DashboardObra | null
  diasRestantes: number | null
  obraId: number
  onLinhaBalancoClick: () => void
  onApontamentosClick: () => void
}

export function TabHome({
  resumo, paralisadas, dadosCurvaS, kpisTemporais,
  obra, diasRestantes, onLinhaBalancoClick, onApontamentosClick,
}: Props) {
  return (
    <div className="space-y-8">
      {/* Alertas de atividades paralisadas */}
      <SectionAlertas paralisadas={paralisadas} />

      {/* Cards temporais: Hoje / Semana / Mês / Total */}
      <KpiCardsTemporais kpisTemporais={kpisTemporais} />

      {/* KPIs analíticos: conclusão, desvio, aderência, críticas */}
      {resumo && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4">🎯 Indicadores da Obra</h2>
          <KpiCards resumo={resumo} />
        </div>
      )}

      {/* Prazo e links rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-white rounded-xl border shadow-sm p-5 ${
          diasRestantes !== null && diasRestantes < 0 ? 'border-red-200' :
          diasRestantes !== null && diasRestantes < 30 ? 'border-yellow-200' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
              diasRestantes !== null && diasRestantes < 0 ? 'bg-red-100' :
              diasRestantes !== null && diasRestantes < 30 ? 'bg-yellow-100' : 'bg-purple-100'
            }`}>📆</div>
            <p className="text-sm text-slate-500 font-medium">Prazo da Obra</p>
          </div>
          {diasRestantes !== null ? (
            <>
              <p className={`text-4xl font-bold ${
                diasRestantes < 0 ? 'text-red-600' : diasRestantes < 30 ? 'text-yellow-600' : 'text-purple-600'
              }`}>{Math.abs(diasRestantes)}</p>
              <p className="text-xs text-slate-400 mt-1">
                {diasRestantes < 0 ? '⚠️ dias em atraso' : diasRestantes === 0 ? '🎯 termina hoje' : 'dias restantes'}
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-300 text-2xl font-bold">—</p>
              <p className="text-xs text-slate-400 mt-1">sem prazo definido</p>
            </>
          )}
          {obra?.data_fim && (
            <p className="text-xs text-slate-400 mt-2">Término previsto: {new Date(obra.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onLinhaBalancoClick}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-green-300 hover:bg-green-50 transition-colors text-left"
        >
          <p className="text-2xl mb-2">📊</p>
          <p className="font-bold text-slate-900">Linha de Balanço</p>
          <p className="text-sm text-slate-500 mt-1">Visualizar e programar atividades</p>
        </button>

        <button
          type="button"
          onClick={onApontamentosClick}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
        >
          <p className="text-2xl mb-2">📝</p>
          <p className="font-bold text-slate-900">Apontamentos</p>
          <p className="text-sm text-slate-500 mt-1">Registrar avanço diário de campo</p>
        </button>
      </div>

      {/* Curva S */}
      <SectionCurvaS dados={dadosCurvaS} />
    </div>
  )
}
