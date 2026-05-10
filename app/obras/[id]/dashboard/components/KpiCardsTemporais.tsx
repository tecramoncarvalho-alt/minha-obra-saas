'use client'

import type { KPIsTemporais, KPITemporalPeriodo } from '../hooks/useKPIsTemporais'

interface Props {
  kpisTemporais: KPIsTemporais
}

const PERIODO_ICONS: Record<string, string> = {
  Hoje: '📅', Semana: '📆', Mês: '🗓️', Total: '📊',
}
const PERIODO_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  Hoje:   { bg: 'bg-blue-50',   text: 'text-blue-700',   bar: 'bg-blue-500' },
  Semana: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  Mês:    { bg: 'bg-purple-50', text: 'text-purple-700',  bar: 'bg-purple-500' },
  Total:  { bg: 'bg-slate-50',  text: 'text-slate-700',   bar: 'bg-slate-500' },
}

function Card({ periodo }: { periodo: KPITemporalPeriodo }) {
  const color = PERIODO_COLORS[periodo.label] ?? PERIODO_COLORS['Total']
  const semDados = periodo.totalApontamentos === 0

  return (
    <div className={`rounded-xl border border-slate-200 p-5 ${color.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{PERIODO_ICONS[periodo.label] ?? '📊'}</span>
        <p className={`text-sm font-bold ${color.text}`}>{periodo.label}</p>
      </div>

      {semDados ? (
        <p className="text-slate-400 text-sm">Sem dados</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Efetivo médio</p>
              <p className={`text-2xl font-bold ${color.text}`}>{periodo.efetivoMedio}</p>
              <p className="text-xs text-slate-400">func./dia</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Avanço médio</p>
              <p className={`text-2xl font-bold ${color.text}`}>{periodo.avancoMedio}%</p>
              <p className="text-xs text-slate-400">{periodo.totalApontamentos} apont.</p>
            </div>
          </div>
          <div className="w-full bg-white/60 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${color.bar}`}
              style={{ width: `${periodo.avancoMedio}%` }}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function KpiCardsTemporais({ kpisTemporais }: Props) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">📈 Produtividade por Período</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card periodo={kpisTemporais.hoje} />
        <Card periodo={kpisTemporais.semana} />
        <Card periodo={kpisTemporais.mes} />
        <Card periodo={kpisTemporais.total} />
      </div>
    </div>
  )
}
