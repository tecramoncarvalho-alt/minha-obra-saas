'use client'

import type { ApontamentoDiario } from '@/app/lib/types'
import type { DashboardAtividade } from '../utils'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  NAO_INICIADA:    { label: 'Não Iniciada',    bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' },
  INICIADA:        { label: 'Iniciada',         bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  EM_ANDAMENTO:    { label: 'Em Andamento',     bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CONCLUIDA_NO_DIA:{ label: 'Concluída Hoje',  bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  PARALISADA:      { label: 'Paralisada',        bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
}

interface Props {
  apontamentos: ApontamentoDiario[]
  atividadesEfetivas: DashboardAtividade[]
  loading: boolean
  erro: string | null
  ultimaAtualizacao: Date | null
  onRefetch: () => void
}

export function TabRealTime({
  apontamentos, atividadesEfetivas, loading, erro, ultimaAtualizacao, onRefetch,
}: Props) {
  const nomeAtividade = (id: number) =>
    atividadesEfetivas.find(a => a.id === id)?.nome ?? `Atividade #${id}`

  const fmtHora = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">🔴 Apontamentos de Hoje</h2>
          {!loading && !erro && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ao vivo
            </span>
          )}
          {loading && (
            <span className="text-xs text-slate-400">atualizando...</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <p className="text-xs text-slate-400">
              Última atualização: {fmtHora(ultimaAtualizacao)}
            </p>
          )}
          <button
            type="button"
            onClick={onRefetch}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm font-semibold">⚠️ Erro ao buscar apontamentos</p>
          <p className="text-red-500 text-xs mt-1">{erro}</p>
        </div>
      )}

      {/* Contadores de status */}
      {apontamentos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const qtd = apontamentos.filter(a => a.status === status).length
            if (qtd === 0) return null
            return (
              <div key={status} className={`rounded-xl border border-slate-200 p-3 ${cfg.bg}`}>
                <p className={`text-2xl font-bold ${cfg.text}`}>{qtd}</p>
                <p className="text-xs text-slate-500 mt-0.5">{cfg.label}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Lista de apontamentos */}
      {apontamentos.length === 0 && !loading && !erro && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-500 font-medium">Nenhum apontamento hoje</p>
          <p className="text-slate-400 text-sm mt-1">Os registros de campo aparecerão aqui em tempo real</p>
        </div>
      )}

      {apontamentos.length > 0 && (
        <div className="space-y-3">
          {[...apontamentos]
            .sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''))
            .map(ap => {
              const cfg = STATUS_CONFIG[ap.status ?? 'EM_ANDAMENTO'] ?? STATUS_CONFIG['EM_ANDAMENTO']
              const horario = ap.updated_at ?? ap.created_at
              return (
                <div key={ap.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4">
                  <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{nomeAtividade(ap.atividade_id)}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span>📈 {ap.percentual_executado}% executado</span>
                      <span>👷 {ap.efetivo_real} func.</span>
                      {ap.responsavel && <span>👤 {ap.responsavel}</span>}
                      {horario && (
                        <span className="text-slate-400">
                          🕐 {new Date(horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {ap.observacao && (
                      <p className="text-xs text-slate-400 mt-1.5 italic">{ap.observacao}</p>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {loading && apontamentos.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">Atualização automática a cada 30 segundos</p>
    </div>
  )
}
