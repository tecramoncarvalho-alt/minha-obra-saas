'use client'

import type { ApontamentoDiario } from '@/app/lib/types'

interface AtividadeParalisada {
  id: number
  nome: string
  pavimentoNome: string
  ultimoApontamento: ApontamentoDiario
}

interface Props {
  paralisadas: AtividadeParalisada[]
}

function fmtData(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

export function AlertasParalisadas({ paralisadas }: Props) {
  if (paralisadas.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
        <span>⛔</span>
        {paralisadas.length === 1
          ? '1 atividade paralisada'
          : `${paralisadas.length} atividades paralisadas`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {paralisadas.map(p => (
          <div key={p.id} className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-semibold text-red-800 text-sm truncate">{p.nome}</p>
            <p className="text-xs text-red-600 mt-0.5">Pavimento: {p.pavimentoNome}</p>
            <p className="text-xs text-red-500 mt-0.5">
              Última atualização: {fmtData(p.ultimoApontamento.data)}
            </p>
            {p.ultimoApontamento.responsavel && (
              <p className="text-xs text-red-500">
                Responsável: {p.ultimoApontamento.responsavel}
              </p>
            )}
            <p className="text-xs font-medium text-red-700 mt-1">
              Progresso preservado: {p.ultimoApontamento.percentual_executado}%
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
