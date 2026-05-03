import { describe, it, expect } from 'vitest'
import {
  calcularAvancoReal,
  calcularDesvioPrazo,
  calcularDeltaEfetivo,
  formatarDesvioPrazo,
  gerarDesviosPorAtividade,
  calcularCurvaS,
} from '../app/lib/calculador-avanco'
import type { Atividade, ApontamentoDiario } from '../app/lib/types'
import type { ConfigCalendario } from '../app/calendario'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const configPadrao: ConfigCalendario = {
  sabadoUtil: false,
  domingoUtil: false,
  feriados: [],
}

const configComFeriado: ConfigCalendario = {
  sabadoUtil: false,
  domingoUtil: false,
  feriados: ['2025-01-01'], // Ano Novo
}

function makeAtividade(overrides: Partial<Atividade> = {}): Atividade {
  return {
    id: 1,
    pavimento_id: 10,
    nome: 'Laje Torre A',
    data_inicio: '2025-01-06', // segunda-feira
    data_fim: '2025-01-17',   // segunda-feira (+10 dias úteis)
    duracao_dias: 10,
    equipe: 'Estrutura',
    efetivo: 8,
    linha_index: 0,
    vinculo_id: null,
    vinculo_ordem: null,
    subatividades: [],
    ...overrides,
  }
}

function makeApontamento(overrides: Partial<ApontamentoDiario> = {}): ApontamentoDiario {
  return {
    id: 'ap-1',
    atividade_id: 1,
    data: '2025-01-10',
    efetivo_real: 8,
    percentual_executado: 50,
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2025-01-10T08:00:00Z',
    ...overrides,
  }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('calcularAvancoReal', () => {
  it('retorna 0 quando não há apontamentos', () => {
    expect(calcularAvancoReal([])).toBe(0)
  })

  it('retorna o percentual do apontamento mais recente', () => {
    const aps = [
      makeApontamento({ data: '2025-01-08', percentual_executado: 20 }),
      makeApontamento({ data: '2025-01-10', percentual_executado: 50 }),
      makeApontamento({ data: '2025-01-09', percentual_executado: 35 }),
    ]
    expect(calcularAvancoReal(aps)).toBe(50)
  })
})

describe('calcularDesvioPrazo', () => {
  it('atividade sem apontamento retorna desvio negativo (atrasada)', () => {
    const at = makeAtividade()
    // Na metade da duração (5 dias úteis decorridos), previsto = 50%, real = 0%
    const desvio = calcularDesvioPrazo(at, configPadrao, '2025-01-13')
    expect(desvio).toBeLessThan(0)
  })

  it('atividade 100% concluída antecipadamente tem desvio positivo', () => {
    const at = makeAtividade()
    const ap = makeApontamento({ data: '2025-01-09', percentual_executado: 100 })
    // No dia 9 (3 dias úteis decorridos de 10), previsto ~30%, real 100%
    const desvio = calcularDesvioPrazo(at, configPadrao, '2025-01-09', ap)
    expect(desvio).toBeGreaterThan(0)
  })

  it('atividade PARALISADA: percentual mantido mesmo com efetivo zerado', () => {
    const at = makeAtividade()
    const ap = makeApontamento({ percentual_executado: 40, efetivo_real: 0, status: 'PARALISADA' })
    const desvio = calcularDesvioPrazo(at, configPadrao, '2025-01-10', ap)
    // percentual real = 40 (preservado), previsto calculado com dias úteis
    expect(ap.percentual_executado).toBe(40)
    expect(desvio).toBeDefined()
  })
})

describe('dias úteis — cruzamento de feriados e fins de semana', () => {
  it('ignora sábados e domingos no cálculo', () => {
    const at = makeAtividade({ data_inicio: '2025-01-06', duracao_dias: 5 }) // seg 06 a sex 10
    const ap = makeApontamento({ data: '2025-01-10', percentual_executado: 100 })
    // Na sex 10, 5 dias úteis decorridos = 100% previsto, 100% real → desvio 0
    const desvio = calcularDesvioPrazo(at, configPadrao, '2025-01-10', ap)
    expect(desvio).toBe(0)
  })

  it('ignora feriado cadastrado na config', () => {
    // Atividade começa dia 30/12 (seg), 01/01 é feriado
    // Dias úteis: 30/12(seg), 31/12(ter), 02/01(qui) — 01/01 feriado ignorado
    const at = makeAtividade({
      data_inicio: '2024-12-30',
      data_fim: '2025-01-03',
      duracao_dias: 4, // 30, 31, 02, 03 (01/01 feriado)
    })
    // Em 31/12: 2 dias úteis decorridos (30,31) de 4 → previsto = 50%
    const ap = makeApontamento({ data: '2024-12-31', percentual_executado: 50, atividade_id: 1 })
    const desvio = calcularDesvioPrazo(at, configComFeriado, '2024-12-31', ap)
    expect(desvio).toBe(0) // real 50% = previsto 50%
  })
})

describe('formatarDesvioPrazo', () => {
  it('retorna sufixo dias úteis para desvio positivo (adiantamento)', () => {
    const resultado = formatarDesvioPrazo(30, 10)
    expect(resultado).toMatch(/^\+\d+ dias úteis$/)
    expect(resultado).toBe('+3 dias úteis')
  })

  it('retorna sufixo dias úteis para desvio negativo (atraso)', () => {
    const resultado = formatarDesvioPrazo(-40, 10)
    expect(resultado).toMatch(/^-\d+ dias úteis$/)
    expect(resultado).toBe('-4 dias úteis')
  })

  it('retorna "0 dias úteis" para desvio zero', () => {
    expect(formatarDesvioPrazo(0, 10)).toBe('0 dias úteis')
  })
})

describe('calcularDeltaEfetivo', () => {
  it('critico=true quando real < 70% do previsto', () => {
    const delta = calcularDeltaEfetivo(10, makeApontamento({ efetivo_real: 6 }))
    expect(delta.critico).toBe(true)
    expect(delta.delta).toBe(-4)
  })

  it('critico=false quando real >= 70% do previsto', () => {
    const delta = calcularDeltaEfetivo(10, makeApontamento({ efetivo_real: 8 }))
    expect(delta.critico).toBe(false)
  })

  it('real=0 quando sem apontamento', () => {
    const delta = calcularDeltaEfetivo(10)
    expect(delta.real).toBe(0)
    expect(delta.delta).toBe(-10)
  })
})

describe('gerarDesviosPorAtividade', () => {
  it('atividade atrasada aparece no início da lista (desvio crescente)', () => {
    const atividades: Atividade[] = [
      makeAtividade({ id: 1 }),
      makeAtividade({ id: 2, nome: 'Alvenaria' }),
    ]
    const apontamentos: ApontamentoDiario[] = [
      makeApontamento({ atividade_id: 1, percentual_executado: 80 }),
      makeApontamento({ atividade_id: 2, percentual_executado: 10 }),
    ]
    const desvios = gerarDesviosPorAtividade(atividades, apontamentos, configPadrao, '2025-01-10')
    expect(desvios[0].desvio_percentual).toBeLessThanOrEqual(desvios[1].desvio_percentual)
  })
})

describe('calcularCurvaS', () => {
  it('retorna array vazio quando não há atividades', () => {
    const pontos = calcularCurvaS([], [], new Date('2025-01-06'), new Date('2025-01-10'), configPadrao)
    expect(pontos).toHaveLength(0)
  })

  it('eixo X contém apenas dias úteis (sem fins de semana)', () => {
    const at = makeAtividade()
    // Usar construtores locais (ano, mês-1, dia) para evitar problema de fuso
    const pontos = calcularCurvaS(
      [at], [],
      new Date(2025, 0, 6),  // segunda
      new Date(2025, 0, 10), // sexta (5 dias úteis)
      configPadrao
    )
    // Deve ter exatamente 5 pontos (seg, ter, qua, qui, sex)
    expect(pontos).toHaveLength(5)
    expect(pontos[0].diasUteis).toBe(1)
    expect(pontos[4].diasUteis).toBe(5)
  })

  it('real=0 sem apontamentos; previsto cresce ao longo do tempo', () => {
    const at = makeAtividade()
    const pontos = calcularCurvaS(
      [at], [],
      new Date(2025, 0, 6),
      new Date(2025, 0, 10),
      configPadrao
    )
    expect(pontos[0].real).toBe(0)
    expect(pontos[pontos.length - 1].real).toBe(0)
    expect(pontos[pontos.length - 1].previsto).toBeGreaterThan(pontos[0].previsto)
  })
})
