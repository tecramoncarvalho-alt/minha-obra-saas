'use client'

import { useRef } from 'react'
import { getCor } from '@/app/obras/[id]/linha-balanco/utils/geradorCores'
import { useAutoScroll } from './useAutoScroll'

export interface TVAtividade {
  id: number
  pavimento_id: number
  nome: string
  data_inicio: string
  data_fim: string
  equipe: string | null
  efetivo: number | null
}

export interface TVPavimento {
  id: number
  nome: string
  numero: number | null
}

export interface TVApontamento {
  atividade_id: number
  data: string
  efetivo_real: number
  percentual_executado: number
  status?: string
}

interface Props {
  atividades: TVAtividade[]
  pavimentos: TVPavimento[]
  apontamentos: TVApontamento[]
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function getSemanaAtual(): Date[] {
  const hoje = new Date()
  const diaSemana = hoje.getDay()
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana
  const segunda = new Date(hoje)
  segunda.setDate(hoje.getDate() + diffSegunda)
  segunda.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda)
    d.setDate(segunda.getDate() + i)
    return d
  })
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Ordena pavimentos por bloco (ordem de aparição por número mínimo) e dentro do bloco por numero asc
function ordenarPavimentos(pavimentos: TVPavimento[]): TVPavimento[] {
  const blocoMap = new Map<string, TVPavimento[]>()
  for (const pav of pavimentos) {
    const bloco = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0] : pav.nome
    const lista = blocoMap.get(bloco) ?? []
    lista.push(pav)
    blocoMap.set(bloco, lista)
  }
  return Array.from(blocoMap.entries())
    .sort(([, pa], [, pb]) => {
      const minA = Math.min(...pa.map(p => p.numero ?? 0))
      const minB = Math.min(...pb.map(p => p.numero ?? 0))
      return minA - minB
    })
    .flatMap(([, pavs]) => pavs.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)))
}

export default function LinhaBalancoTV({ atividades, pavimentos, apontamentos }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useAutoScroll(scrollRef)

  const diasSemana = getSemanaAtual()
  const segStr = toISO(diasSemana[0])
  const domStr = toISO(diasSemana[6])
  const hojeStr = toISO(new Date())

  // Mapa: atividadeId → apontamento mais recente (apontamentos chegam ordenados desc por data)
  const ultApontamento = new Map<number, TVApontamento>()
  for (const ap of apontamentos) {
    if (!ultApontamento.has(ap.atividade_id)) {
      ultApontamento.set(ap.atividade_id, ap)
    }
  }

  // Atividades da semana, excluindo 100% concluídas
  const atividadesSemana = atividades.filter(a => {
    if (a.data_inicio > domStr || a.data_fim < segStr) return false
    const pct = ultApontamento.get(a.id)?.percentual_executado ?? 0
    return pct < 100
  })

  const porPavimento = new Map<number, TVAtividade[]>()
  for (const at of atividadesSemana) {
    const lista = porPavimento.get(at.pavimento_id) ?? []
    lista.push(at)
    porPavimento.set(at.pavimento_id, lista)
  }

  // Pavimentos com atividades, ordenados por bloco→número
  const pavimentosOrdenados = ordenarPavimentos(pavimentos)
  const pavimentosComAtiv = pavimentosOrdenados.filter(p => porPavimento.has(p.id))

  if (!atividadesSemana.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-lg">
        Nenhuma atividade programada para esta semana
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabeçalho de dias */}
      <div className="grid gap-px flex-shrink-0" style={{ gridTemplateColumns: '200px repeat(7, 1fr)' }}>
        <div className="bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Atividade
        </div>
        {diasSemana.map((dia, i) => (
          <div
            key={i}
            className={`px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide ${
              toISO(dia) === hojeStr
                ? 'bg-green-900 text-green-300'
                : 'bg-gray-900 text-gray-400'
            }`}
          >
            <div>{DIAS_SEMANA[i]}</div>
            <div className="text-gray-500 font-normal">{dia.getDate()}/{dia.getMonth() + 1}</div>
          </div>
        ))}
      </div>

      {/* Linhas de atividades por pavimento */}
      <div ref={scrollRef} className="overflow-y-auto flex-1">
        {pavimentosComAtiv.map(pav => {
          const atsPav = porPavimento.get(pav.id) ?? []
          const nomePav = pav.nome.includes(' - ') ? pav.nome.split(' - ')[1] : pav.nome
          const blocoNome = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0] : ''

          return (
            <div key={pav.id}>
              {/* Header do pavimento */}
              <div
                className="grid gap-px"
                style={{ gridTemplateColumns: '200px repeat(7, 1fr)' }}
              >
                <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400 font-semibold truncate border-l-2 border-blue-500">
                  <span className="text-blue-400">{blocoNome || 'Bloco'}</span>
                  {blocoNome && ' — '}
                  {nomePav}
                </div>
                {diasSemana.map((_, i) => (
                  <div key={i} className="bg-gray-800 border-b border-gray-700/50" />
                ))}
              </div>

              {/* Atividades do pavimento */}
              {atsPav.map(at => {
                const cor = getCor(at.equipe ?? 'Sem equipe')
                const ap = ultApontamento.get(at.id)
                const pct = ap?.percentual_executado ?? 0

                return (
                  <div
                    key={at.id}
                    className="grid gap-px"
                    style={{ gridTemplateColumns: '200px repeat(7, 1fr)' }}
                  >
                    {/* Nome da atividade */}
                    <div className="bg-gray-900/80 px-3 py-1.5 flex flex-col justify-center min-h-[44px]">
                      <span className="text-sm font-medium text-gray-200 truncate leading-tight">
                        {at.nome}
                      </span>
                      {at.equipe && (
                        <span className="text-xs text-gray-500 truncate">{at.equipe}</span>
                      )}
                    </div>

                    {/* Células por dia */}
                    {diasSemana.map((dia, i) => {
                      const diaStr = toISO(dia)
                      const ativa = at.data_inicio <= diaStr && at.data_fim >= diaStr
                      const isHoje = diaStr === hojeStr

                      return (
                        <div
                          key={i}
                          className={`relative min-h-[44px] p-1 ${
                            isHoje ? 'bg-green-950/30' : 'bg-gray-900/60'
                          } border-b border-gray-800`}
                        >
                          {ativa && (
                            <div className="relative h-full min-h-[32px] rounded overflow-hidden">
                              {/* Barra planejada */}
                              <div
                                className="absolute inset-0 rounded"
                                style={{ backgroundColor: cor, opacity: 0.25 }}
                              />
                              {/* Barra real */}
                              {pct === 0 ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-red-400 text-sm">⚠</span>
                                </div>
                              ) : (
                                <div
                                  className="absolute inset-y-0 left-0 rounded flex items-center justify-center"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: cor,
                                    opacity: 0.85,
                                    minWidth: pct > 0 ? '4px' : 0,
                                  }}
                                >
                                  {pct >= 25 && (
                                    <span className="text-xs font-bold text-white px-0.5 truncate">
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
