'use client'

import { useState } from 'react'
import type { Atividade, ApontamentoDiario, DesvioAtividade, DeltaEfetivo } from '@/app/lib/types'
import { calcularDeltaEfetivo } from '@/app/lib/calculador-avanco'
import { RowHighlight } from './RowHighlight'

interface AtividadeComDesvio {
  atividade: Atividade & { pavimentoNome: string }
  desvio: DesvioAtividade
  ultimoApontamento?: ApontamentoDiario
}

interface Props {
  itens: AtividadeComDesvio[]
  historicoPorAtividade: Record<number, ApontamentoDiario[]>
  hoje: string
}

function fmtData(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

const STATUS_LABELS: Record<string, string> = {
  NAO_INICIADA: 'Não Iniciada',
  INICIADA: 'Iniciada',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA_NO_DIA: 'Concluída',
  PARALISADA: 'Paralisada',
}

export function TabelaAtencao({ itens, historicoPorAtividade, hoje }: Props) {
  const [drawerAtividade, setDrawerAtividade] = useState<number | null>(null)

  const emAtencao = itens.filter(({ atividade, desvio }) =>
    Math.abs(desvio.desvio_percentual) > 10 ||
    (hoje > atividade.data_fim && desvio.status_apontamento !== 'CONCLUIDA_NO_DIA') ||
    desvio.status_apontamento === 'PARALISADA'
  )

  if (emAtencao.length === 0) return null

  const drawerHistorico = drawerAtividade !== null ? historicoPorAtividade[drawerAtividade] ?? [] : []
  const drawerNome = emAtencao.find(i => i.atividade.id === drawerAtividade)?.atividade.nome ?? ''

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Atividades em Atenção</h3>
          <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded">
            {emAtencao.length}
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {emAtencao.map(({ atividade, desvio, ultimoApontamento }) => {
            const delta: DeltaEfetivo = calcularDeltaEfetivo(atividade.efetivo ?? 0, ultimoApontamento)
            return (
              <RowHighlight
                key={atividade.id}
                pavimentoNome={atividade.pavimentoNome}
                desvio={desvio}
                delta={delta}
                ultimoApontamento={ultimoApontamento}
                onClick={() => setDrawerAtividade(prev => prev === atividade.id ? null : atividade.id)}
              />
            )
          })}
        </div>
      </div>

      {/* Drawer de histórico */}
      {drawerAtividade !== null && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 text-sm truncate max-w-[280px]">{drawerNome}</p>
              <p className="text-xs text-gray-400 mt-0.5">Histórico de apontamentos</p>
            </div>
            <button
              onClick={() => setDrawerAtividade(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {drawerHistorico.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Nenhum apontamento registrado
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {[...drawerHistorico].reverse().map(ap => (
                  <div key={ap.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{fmtData(ap.data)}</span>
                      {ap.status && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {STATUS_LABELS[ap.status] ?? ap.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{ap.percentual_executado}% executado</span>
                      <span>👷 {ap.efetivo_real} func.</span>
                      {ap.responsavel && <span>por {ap.responsavel}</span>}
                    </div>
                    {ap.observacao && (
                      <p className="text-xs text-gray-400 mt-1 italic">{ap.observacao}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay clicável para fechar o drawer */}
      {drawerAtividade !== null && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setDrawerAtividade(null)}
        />
      )}
    </>
  )
}
