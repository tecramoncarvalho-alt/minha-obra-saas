'use client'

import { TabelaAtencao } from '../components/TabelaAtencao'
import type { ApontamentoDiario, Atividade as LibAtividade, DesvioAtividade } from '@/app/lib/types'

interface AtividadeComDesvio {
  atividade: LibAtividade & { pavimentoNome: string }
  desvio: DesvioAtividade
  ultimoApontamento?: ApontamentoDiario
}

interface Props {
  itens: AtividadeComDesvio[]
  historicoPorAtividade: Record<number, ApontamentoDiario[]>
  hoje: string
}

export function SectionAtencao({ itens, historicoPorAtividade, hoje }: Props) {
  return (
    <TabelaAtencao
      itens={itens}
      historicoPorAtividade={historicoPorAtividade}
      hoje={hoje}
    />
  )
}
