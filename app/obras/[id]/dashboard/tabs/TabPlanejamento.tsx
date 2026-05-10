'use client'

import { SectionKPIs } from '../sections/SectionKPIs'
import { SectionEfetivo } from '../sections/SectionEfetivo'
import { SectionAtencao } from '../sections/SectionAtencao'
import type { ApontamentoDiario, ResumoAvancoObra, Atividade as LibAtividade, DesvioAtividade } from '@/app/lib/types'
import type { DashboardAtividade, DashboardObra, ItemEfetivo } from '../utils'

interface AtividadeComDesvio {
  atividade: LibAtividade & { pavimentoNome: string }
  desvio: DesvioAtividade
  ultimoApontamento?: ApontamentoDiario
}

interface Props {
  resumo: ResumoAvancoObra | null
  efetivoPorEquipe: ItemEfetivo[]
  atividadesDoDia: DashboardAtividade[]
  equipesAtivas: number
  avancoRealHoje: number | null
  efetivoRealHoje: number
  atividadesSemApontamento: DashboardAtividade[]
  desvios: DesvioAtividade[]
  itensAtencao: AtividadeComDesvio[]
  historicoPorAtividade: Record<number, ApontamentoDiario[]>
  apontamentosHoje: ApontamentoDiario[]
  dataSelecionada: string
  isHoje: boolean
  diasRestantes: number | null
  obra: DashboardObra | null
  obraId: number
  onApontamentosClick: () => void
}

export function TabPlanejamento({
  resumo, efetivoPorEquipe, atividadesDoDia, equipesAtivas,
  avancoRealHoje, efetivoRealHoje, atividadesSemApontamento,
  desvios, itensAtencao, historicoPorAtividade,
  apontamentosHoje, dataSelecionada, isHoje,
  diasRestantes, obra, obraId, onApontamentosClick,
}: Props) {
  return (
    <div className="space-y-8">
      {obra && (
        <SectionKPIs
          resumo={resumo}
          efetivoPorEquipe={efetivoPorEquipe}
          atividadesEmAndamento={atividadesDoDia.length}
          equipesAtivas={equipesAtivas}
          diasRestantes={diasRestantes}
          obra={obra}
          isHoje={isHoje}
          avancoRealHoje={avancoRealHoje}
          efetivoRealHoje={efetivoRealHoje}
          atividadesSemApontamento={atividadesSemApontamento}
          obraId={obraId}
          onApontamentosClick={onApontamentosClick}
        />
      )}

      <SectionEfetivo
        efetivoPorEquipe={efetivoPorEquipe}
        atividadesDoDia={atividadesDoDia}
        apontamentosHoje={apontamentosHoje}
        desvios={desvios}
        dataSelecionada={dataSelecionada}
        isHoje={isHoje}
      />

      <SectionAtencao
        itens={itensAtencao}
        historicoPorAtividade={historicoPorAtividade}
        hoje={dataSelecionada}
      />
    </div>
  )
}
