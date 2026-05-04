'use client'

import { useMemo } from 'react'
import { GridEfetivo } from '../components/GridEfetivo'
import type { ApontamentoDiario, Atividade as LibAtividade, DesvioAtividade } from '@/app/lib/types'
import { fmtDate, getCorEquipe, parseDate, CORES_EQUIPE, type DashboardAtividade, type ItemEfetivo } from '../utils'

interface Props {
  efetivoPorEquipe: ItemEfetivo[]
  atividadesDoDia: DashboardAtividade[]
  apontamentosHoje: ApontamentoDiario[]
  desvios: DesvioAtividade[]
  dataSelecionada: string
  isHoje: boolean
}

export function SectionEfetivo({ efetivoPorEquipe, atividadesDoDia, apontamentosHoje, desvios, dataSelecionada, isHoje }: Props) {
  const totalEfetivo = efetivoPorEquipe.reduce((acc, e) => acc + e.efetivo, 0)
  const atividadesEmAndamento = atividadesDoDia.length

  const atividadesPorBloco = useMemo(() => {
    const grupos: Record<string, DashboardAtividade[]> = {}
    atividadesDoDia.forEach(at => {
      const bloco = at.pavimento?.nome.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : (at.pavimento?.nome || 'Sem bloco')
      if (!grupos[bloco]) grupos[bloco] = []
      grupos[bloco].push(at)
    })
    return grupos
  }, [atividadesDoDia])

  return (
    <>
      {/* ─── Grid 2 colunas: Efetivo por Equipe + Atividades do Dia ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Efetivo por Equipe */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">👷 Efetivo por Equipe</h2>
            {totalEfetivo > 0 && (
              <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">
                {totalEfetivo} total
              </span>
            )}
          </div>

          {efetivoPorEquipe.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <p className="text-4xl mb-3">😴</p>
              <p className="text-slate-500 font-medium">Nenhuma equipe prevista</p>
              <p className="text-slate-400 text-sm mt-1">
                {isHoje ? 'Não há atividades programadas para hoje' : `Não há atividades em ${fmtDate(dataSelecionada)}`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {efetivoPorEquipe.map(item => {
                const cor = getCorEquipe(item.equipe)
                const pct = totalEfetivo > 0 ? (item.efetivo / totalEfetivo) * 100 : 0
                return (
                  <div key={item.equipe} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cor }} />
                        <p className="font-bold text-slate-900">{item.equipe}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.efetivo > 0 && (
                          <span className="text-2xl font-bold" style={{ color: cor }}>{item.efetivo}</span>
                        )}
                        <span className="text-xs text-slate-400">
                          {item.efetivo > 0 ? 'func.' : 'sem efetivo'}
                        </span>
                      </div>
                    </div>
                    {item.efetivo > 0 && (
                      <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {item.atividades.map((at, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <span className="text-slate-300 mt-0.5">•</span>
                          <span>
                            <span className="font-medium text-slate-700">{at.nome}</span>
                            {at.subNome && <span className="text-slate-500"> → {at.subNome}</span>}
                            <span className="text-slate-400"> · {at.pavimento}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Atividades do Dia por Bloco */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">⚙️ Atividades do Dia</h2>
            {atividadesEmAndamento > 0 && (
              <span className="bg-green-100 text-green-700 text-sm font-bold px-3 py-1 rounded-full">
                {atividadesEmAndamento} atividade{atividadesEmAndamento > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {atividadesDoDia.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-slate-500 font-medium">Nenhuma atividade prevista</p>
              <p className="text-slate-400 text-sm mt-1">
                {isHoje ? 'Nada programado para hoje' : `Nada programado para ${fmtDate(dataSelecionada)}`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(atividadesPorBloco).map(([bloco, ativs]) => (
                <div key={bloco} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                    <span>🏢</span>
                    <h3 className="font-bold text-slate-900 text-sm">{bloco}</h3>
                    <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      {ativs.length} atividade{ativs.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ativs.map(at => {
                      const diasTotais = at.duracao_dias || 1
                      const diasDecorridos = Math.floor((parseDate(dataSelecionada).getTime() - parseDate(at.data_inicio).getTime()) / 86400000) + 1
                      const progresso = Math.min(100, Math.round((diasDecorridos / diasTotais) * 100))
                      return (
                        <div key={at.id} className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900 text-sm">{at.nome}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {at.pavimento?.nome.includes(' - ')
                                  ? at.pavimento.nome.split(' - ')[1]
                                  : at.pavimento?.nome}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {progresso}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                            <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progresso}%` }} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>📅 {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</span>
                            <span>⏱️ {diasDecorridos}/{diasTotais}d</span>
                            {at.equipe && !at.subatividades.length && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(at.equipe) }} />
                                {at.equipe}
                              </span>
                            )}
                          </div>
                          {at.subatividades.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              {at.subatividades.map((sub, i) => (
                                <div key={sub.id} className="flex items-center gap-2 bg-slate-50 rounded px-3 py-1.5 text-xs">
                                  <div className="w-2 h-2 rounded-sm flex-shrink-0"
                                    style={{ backgroundColor: CORES_EQUIPE[(i * 2) % CORES_EQUIPE.length] }} />
                                  <span className="font-medium text-slate-700">{sub.nome}</span>
                                  <span className="text-slate-400">{sub.duracao}d</span>
                                  {sub.equipe && (
                                    <span className="flex items-center gap-1 ml-auto">
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(sub.equipe) }} />
                                      {sub.equipe}
                                      {sub.efetivo && <span className="font-bold text-slate-600">· {sub.efetivo} func.</span>}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Grid efetivo previsto vs real ─── */}
      {atividadesDoDia.length > 0 && (
        <GridEfetivo
          atividades={atividadesDoDia as LibAtividade[]}
          apontamentosHoje={apontamentosHoje}
          desvios={desvios}
        />
      )}
    </>
  )
}
