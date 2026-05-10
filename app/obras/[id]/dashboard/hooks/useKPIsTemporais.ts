import { useMemo } from 'react'
import type { ApontamentoDiario } from '@/app/lib/types'
import { parseDate, toStr } from '../utils'

export interface KPITemporalPeriodo {
  label: string
  efetivoMedio: number
  avancoMedio: number
  totalApontamentos: number
}

export interface KPIsTemporais {
  hoje: KPITemporalPeriodo
  semana: KPITemporalPeriodo
  mes: KPITemporalPeriodo
  total: KPITemporalPeriodo
}

interface Options {
  todosApontamentos: ApontamentoDiario[]
  dataSelecionada: string
  enabled: boolean
}

const zeroPeriodo = (label: string): KPITemporalPeriodo => ({
  label, efetivoMedio: 0, avancoMedio: 0, totalApontamentos: 0,
})

const EMPTY: KPIsTemporais = {
  hoje:   zeroPeriodo('Hoje'),
  semana: zeroPeriodo('Semana'),
  mes:    zeroPeriodo('Mês'),
  total:  zeroPeriodo('Total'),
}

function calcPeriodo(filtrados: ApontamentoDiario[], label: string): KPITemporalPeriodo {
  if (!filtrados.length) return zeroPeriodo(label)
  const efetivoMedio = Math.round(filtrados.reduce((a, b) => a + b.efetivo_real, 0) / filtrados.length)
  const avancoMedio  = Math.round(filtrados.reduce((a, b) => a + b.percentual_executado, 0) / filtrados.length)
  return { label, efetivoMedio, avancoMedio, totalApontamentos: filtrados.length }
}

export function useKPIsTemporais({ todosApontamentos, dataSelecionada, enabled }: Options): KPIsTemporais {
  return useMemo((): KPIsTemporais => {
    if (!enabled || todosApontamentos.length === 0) return EMPTY
    const ref = parseDate(dataSelecionada)
    const cutSemana = toStr(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 6))
    const cutMes    = toStr(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 29))
    return {
      hoje:   calcPeriodo(todosApontamentos.filter(a => a.data === dataSelecionada), 'Hoje'),
      semana: calcPeriodo(todosApontamentos.filter(a => a.data >= cutSemana && a.data <= dataSelecionada), 'Semana'),
      mes:    calcPeriodo(todosApontamentos.filter(a => a.data >= cutMes    && a.data <= dataSelecionada), 'Mês'),
      total:  calcPeriodo(todosApontamentos, 'Total'),
    }
  }, [enabled, todosApontamentos, dataSelecionada])
}
