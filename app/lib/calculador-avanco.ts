import type { Atividade, ApontamentoDiario, DesvioAtividade, DeltaEfetivo, Obra, ResumoAvancoObra, CurvaSPoint } from './types'
import { contarDiasUteis, parseDate, toStr, isDiaUtil, addDias } from '@/app/calendario'
import type { ConfigCalendario } from '@/app/calendario'

function hoje(): string {
  return toStr(new Date())
}

// ─── Utilitários de display ──────────────────────────────────────────────────

/**
 * Formata um desvio em percentual como string sufixada com "dias úteis".
 * Converte % → dias usando a duração da atividade.
 */
export function formatarDesvioPrazo(desvioPercentual: number, duracaoDias: number): string {
  if (desvioPercentual === 0) return '0 dias úteis'
  const dias = Math.abs(Math.round((Math.abs(desvioPercentual) / 100) * duracaoDias))
  return desvioPercentual > 0
    ? `+${dias} dias úteis`
    : `-${dias} dias úteis`
}

// ─── Funções puras de cálculo ────────────────────────────────────────────────

/** Retorna o percentual_executado do apontamento mais recente, ou 0 se não houver. */
export function calcularAvancoReal(apontamentos: ApontamentoDiario[]): number {
  if (!apontamentos.length) return 0
  const mais_recente = apontamentos.reduce((acc, a) => (a.data > acc.data ? a : acc))
  return mais_recente.percentual_executado
}

/** Média simples dos percentuais de todos os apontamentos. */
export function calcularAvancoRealMedia(apontamentos: ApontamentoDiario[]): number {
  if (!apontamentos.length) return 0
  const soma = apontamentos.reduce((acc, a) => acc + a.percentual_executado, 0)
  return Math.round(soma / apontamentos.length)
}

/**
 * Desvio de prazo em %: percentual_real − percentual_previsto.
 * Negativo = atrasado, positivo = adiantado.
 * Usa exclusivamente dias úteis via ConfigCalendario.
 */
export function calcularDesvioPrazo(
  atividade: Atividade,
  config: ConfigCalendario,
  dataReferencia: string = hoje(),
  ultimoApontamento?: ApontamentoDiario
): number {
  const duracao = atividade.duracao_dias ?? 1
  const diasDecorridos = contarDiasUteis(
    parseDate(atividade.data_inicio),
    parseDate(dataReferencia),
    config
  )
  const percentualPrevisto = Math.min(100, Math.round((diasDecorridos / duracao) * 100))
  const percentualReal = ultimoApontamento?.percentual_executado ?? 0
  return percentualReal - percentualPrevisto
}

/** Calcula delta entre efetivo previsto e real, indicando se é crítico (< 70%). */
export function calcularDeltaEfetivo(
  efetivoPrevisto: number,
  apontamento?: ApontamentoDiario
): DeltaEfetivo {
  const real = apontamento?.efetivo_real ?? 0
  const delta = real - efetivoPrevisto
  return {
    previsto: efetivoPrevisto,
    real,
    delta,
    critico: efetivoPrevisto > 0 && real < efetivoPrevisto * 0.7,
  }
}

/** Média do efetivo real registrado nos apontamentos. */
export function calcularEfetivoMedioReal(apontamentos: ApontamentoDiario[]): number {
  if (!apontamentos.length) return 0
  const soma = apontamentos.reduce((acc, a) => acc + a.efetivo_real, 0)
  return Math.round(soma / apontamentos.length)
}

/**
 * Para cada atividade, calcula o desvio usando o apontamento mais recente disponível.
 * Retorna lista ordenada por desvio crescente (mais atrasados primeiro).
 * Usa dias úteis via ConfigCalendario.
 */
export function gerarDesviosPorAtividade(
  atividades: Atividade[],
  apontamentos: ApontamentoDiario[],
  config: ConfigCalendario,
  dataReferencia: string = hoje()
): DesvioAtividade[] {
  const porAtividade = new Map<number, ApontamentoDiario>()
  for (const a of apontamentos) {
    const atual = porAtividade.get(a.atividade_id)
    if (!atual || a.data > atual.data) {
      porAtividade.set(a.atividade_id, a)
    }
  }

  return atividades
    .map((at): DesvioAtividade => {
      const ultimo = porAtividade.get(at.id)
      const duracao = at.duracao_dias ?? 1
      const diasDecorridos = contarDiasUteis(
        parseDate(at.data_inicio),
        parseDate(dataReferencia),
        config
      )
      const percentualPrevisto = Math.min(100, Math.round((diasDecorridos / duracao) * 100))
      const percentualReal = ultimo?.percentual_executado ?? 0
      const desvio = percentualReal - percentualPrevisto

      let status: DesvioAtividade['status'] = 'no_prazo'
      if (desvio < -5) status = 'atrasado'
      else if (desvio > 5) status = 'adiantado'

      const diasAtraso = desvio < 0 ? Math.round((Math.abs(desvio) / 100) * duracao) : 0

      return {
        atividade_id: at.id,
        nome_atividade: at.nome,
        percentual_previsto: percentualPrevisto,
        percentual_real: percentualReal,
        desvio_percentual: desvio,
        dias_atraso: diasAtraso,
        status,
        status_apontamento: ultimo?.status,
      }
    })
    .sort((a, b) => a.desvio_percentual - b.desvio_percentual)
}

/**
 * Gera resumo geral de avanço da obra.
 * Ponderação por duracao_dias de cada atividade.
 * Usa dias úteis via ConfigCalendario.
 */
export function gerarResumoAvancoObra(
  obra: Obra,
  atividades: Atividade[],
  apontamentos: ApontamentoDiario[],
  config: ConfigCalendario,
  dataReferencia: string = hoje()
): ResumoAvancoObra {
  const desvios = gerarDesviosPorAtividade(atividades, apontamentos, config, dataReferencia)

  const pesoTotal = atividades.reduce((acc, at) => acc + (at.duracao_dias ?? 1), 0)

  let avancoReaPonderado = 0
  let avancoPrevPonderado = 0
  let efetivoPrevistoTotal = 0
  let efetivoRealTotal = 0

  for (const at of atividades) {
    const peso = at.duracao_dias ?? 1
    const d = desvios.find(d => d.atividade_id === at.id)
    avancoReaPonderado += (d?.percentual_real ?? 0) * peso
    avancoPrevPonderado += (d?.percentual_previsto ?? 0) * peso
    efetivoPrevistoTotal += at.efetivo ?? 0
  }

  for (const a of apontamentos.filter(a => a.data === dataReferencia)) {
    efetivoRealTotal += a.efetivo_real
  }

  const percentualConclusaoGeral = pesoTotal > 0 ? Math.round(avancoReaPonderado / pesoTotal) : 0
  const avancoReal = pesoTotal > 0 ? Math.round(avancoReaPonderado / pesoTotal) : 0
  const avancoPrevisto = pesoTotal > 0 ? Math.round(avancoPrevPonderado / pesoTotal) : 0

  // Desvio geral em dias úteis restantes até data_fim da obra
  const diasUteisFim = obra.data_fim
    ? contarDiasUteis(parseDate(dataReferencia), parseDate(obra.data_fim), config)
    : 0
  const diasAtraso = Math.max(0, Math.round(((avancoPrevisto - avancoReal) / 100) * diasUteisFim))

  const aderenciaEfetivo = efetivoPrevistoTotal > 0
    ? Math.round((efetivoRealTotal / efetivoPrevistoTotal) * 100)
    : 100

  return {
    percentual_conclusao_geral: percentualConclusaoGeral,
    avanço_previsto: avancoPrevisto,
    avanço_real: avancoReal,
    dias_atraso_geral: diasAtraso,
    efetivo_previsto_total: efetivoPrevistoTotal,
    efetivo_real_total: efetivoRealTotal,
    aderencia_efetivo: aderenciaEfetivo,
    atividades_atrasadas: desvios.filter(d => d.status === 'atrasado'),
    data_calculo: dataReferencia,
  }
}

/**
 * Gera pontos da Curva S: progresso acumulado planejado vs real, em dias úteis.
 * O eixo X contém apenas dias úteis (exclui fins de semana e feriados da config).
 * Status PARALISADA: mantém o percentual real do último apontamento anterior.
 */
export function calcularCurvaS(
  atividades: Atividade[],
  apontamentos: ApontamentoDiario[],
  dataInicio: Date,
  dataFim: Date,
  config: ConfigCalendario
): CurvaSPoint[] {
  if (atividades.length === 0) return []

  const pesoTotal = atividades.reduce((acc, at) => acc + (at.duracao_dias ?? 1), 0)
  if (pesoTotal === 0) return []

  // Indexar apontamentos por atividade_id e data
  const apMap = new Map<string, ApontamentoDiario>()
  for (const ap of apontamentos) {
    apMap.set(`${ap.atividade_id}:${ap.data}`, ap)
  }

  // Apontamento mais recente por atividade (acumulado)
  const ultimoPorAtividade = new Map<number, ApontamentoDiario>()
  const apOrdenados = [...apontamentos].sort((a, b) => a.data.localeCompare(b.data))
  for (const ap of apOrdenados) {
    ultimoPorAtividade.set(ap.atividade_id, ap)
  }

  const pontos: CurvaSPoint[] = []
  let diasUteisContados = 0
  // Usar datas locais para evitar problemas de fuso horário
  const atual = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate())
  const fim = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate())

  while (atual <= fim) {
    if (isDiaUtil(atual, config)) {
      diasUteisContados++
      const dataStr = toStr(atual)

      // Atualizar último apontamento de cada atividade até esta data
      for (const ap of apontamentos.filter(a => a.data === dataStr)) {
        ultimoPorAtividade.set(ap.atividade_id, ap)
      }

      let previstoPonderado = 0
      let realPonderado = 0

      for (const at of atividades) {
        const peso = at.duracao_dias ?? 1
        const duracao = at.duracao_dias ?? 1
        const inicioAt = parseDate(at.data_inicio)

        if (atual >= inicioAt) {
          const decorridos = contarDiasUteis(inicioAt, atual, config)
          previstoPonderado += Math.min(100, Math.round((decorridos / duracao) * 100)) * peso
        }

        const ult = ultimoPorAtividade.get(at.id)
        if (ult && ult.data <= dataStr) {
          realPonderado += ult.percentual_executado * peso
        }
      }

      pontos.push({
        data: dataStr,
        diasUteis: diasUteisContados,
        previsto: pesoTotal > 0 ? Math.round(previstoPonderado / pesoTotal) : 0,
        real: pesoTotal > 0 ? Math.round(realPonderado / pesoTotal) : 0,
      })
    }
    atual.setDate(atual.getDate() + 1)
  }

  return pontos
}
