'use client'

import { KpiCards } from '../components/KpiCards'
import type { ResumoAvancoObra } from '@/app/lib/types'
import type { DashboardAtividade, DashboardObra, ItemEfetivo } from '../utils'

interface Props {
  resumo: ResumoAvancoObra | null
  efetivoPorEquipe: ItemEfetivo[]
  atividadesEmAndamento: number
  equipesAtivas: number
  diasRestantes: number | null
  obra: DashboardObra
  isHoje: boolean
  avancoRealHoje: number | null
  efetivoRealHoje: number
  atividadesSemApontamento: DashboardAtividade[]
  obraId: number
  onApontamentosClick: () => void
}

export function SectionKPIs({
  resumo, efetivoPorEquipe, atividadesEmAndamento, equipesAtivas,
  diasRestantes, obra, isHoje, avancoRealHoje, efetivoRealHoje,
  atividadesSemApontamento, obraId, onApontamentosClick,
}: Props) {
  const totalEfetivo = efetivoPorEquipe.reduce((acc, e) => acc + e.efetivo, 0)

  return (
    <>
      {/* ─── 4 cards de resumo ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">👷</div>
            <p className="text-sm text-slate-500 font-medium">Efetivo {isHoje ? 'Hoje' : 'no Dia'}</p>
          </div>
          <p className="text-4xl font-bold text-blue-600">{totalEfetivo}</p>
          <p className="text-xs text-slate-400 mt-1">funcionários previstos</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">⚙️</div>
            <p className="text-sm text-slate-500 font-medium">Atividades</p>
          </div>
          <p className="text-4xl font-bold text-green-600">{atividadesEmAndamento}</p>
          <p className="text-xs text-slate-400 mt-1">em execução no dia</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">🦺</div>
            <p className="text-sm text-slate-500 font-medium">Equipes Ativas</p>
          </div>
          <p className="text-4xl font-bold text-orange-600">{equipesAtivas}</p>
          <p className="text-xs text-slate-400 mt-1">equipes no campo</p>
        </div>

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
            <p className="text-slate-400 text-sm">Sem prazo definido</p>
          )}
        </div>
      </div>

      {/* ─── KPIs de avanço planejado vs real ─── */}
      {resumo && <KpiCards resumo={resumo} />}

      {/* ─── Cards de avanço real (somente hoje) ─── */}
      {isHoje && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl">📈</div>
              <p className="text-sm text-slate-500 font-medium">Avanço Real de Hoje</p>
            </div>
            {avancoRealHoje !== null ? (
              <>
                <p className={`text-4xl font-bold ${
                  avancoRealHoje >= 80 ? 'text-green-600' : avancoRealHoje >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{avancoRealHoje}%</p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${avancoRealHoje >= 80 ? 'bg-green-500' : avancoRealHoje >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${avancoRealHoje}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">média das atividades com apontamento</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-300">—</p>
                <p className="text-xs text-slate-400 mt-1">sem apontamentos hoje</p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center text-xl">👥</div>
              <p className="text-sm text-slate-500 font-medium">Efetivo Real vs Previsto</p>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold text-teal-600">{efetivoRealHoje}</p>
              <p className="text-lg text-slate-400 mb-0.5">/ {totalEfetivo}</p>
            </div>
            {totalEfetivo > 0 && (
              <>
                <div className="flex gap-1 mt-2">
                  <div className="h-2 rounded-l-full bg-teal-500" style={{ width: `${Math.min(100, Math.round(efetivoRealHoje / totalEfetivo * 100))}%` }} />
                  <div className="h-2 rounded-r-full bg-slate-100 flex-1" />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {Math.round(efetivoRealHoje / totalEfetivo * 100)}% de aderência
                </p>
              </>
            )}
            {totalEfetivo === 0 && (
              <p className="text-xs text-slate-400 mt-1">nenhum efetivo previsto hoje</p>
            )}
          </div>

          <button
            onClick={onApontamentosClick}
            className={`bg-white rounded-xl border shadow-sm p-5 text-left transition-colors hover:bg-slate-50 ${
              atividadesSemApontamento.length > 0 ? 'border-red-200' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                atividadesSemApontamento.length > 0 ? 'bg-red-100' : 'bg-green-100'
              }`}>
                {atividadesSemApontamento.length > 0 ? '⚠️' : '✅'}
              </div>
              <p className="text-sm text-slate-500 font-medium">Sem Apontamento Hoje</p>
            </div>
            <p className={`text-4xl font-bold ${atividadesSemApontamento.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {atividadesSemApontamento.length}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {atividadesSemApontamento.length === 0
                ? 'todas as atividades apontadas'
                : 'atividades aguardando apontamento — clique para registrar'}
            </p>
          </button>
        </div>
      )}
    </>
  )
}
