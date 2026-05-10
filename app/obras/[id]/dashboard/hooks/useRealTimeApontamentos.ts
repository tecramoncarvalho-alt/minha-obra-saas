'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ApontamentoDiario } from '@/app/lib/types'
import { hoje } from '../utils'

interface Options {
  obraId: number
  enabled: boolean
  intervalMs?: number
}

interface RealTimeState {
  apontamentos: ApontamentoDiario[]
  loading: boolean
  erro: string | null
  ultimaAtualizacao: Date | null
  refetch: () => void
}

export function useRealTimeApontamentos({ obraId, enabled, intervalMs = 30_000 }: Options): RealTimeState {
  const [apontamentos, setApontamentos] = useState<ApontamentoDiario[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null)
  const [triggerRefetch, setTriggerRefetch] = useState(0)

  const refetch = useCallback(() => setTriggerRefetch(n => n + 1), [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const doFetch = async () => {
      setLoading(true)
      setErro(null)
      try {
        const res = await fetch(`/api/obras/${obraId}/apontamentos?data=${hoje()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as ApontamentoDiario[]
        if (!cancelled) {
          setApontamentos(data)
          setUltimaAtualizacao(new Date())
        }
      } catch (e) {
        if (!cancelled) setErro(e instanceof Error ? e.message : 'Erro ao buscar dados')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void doFetch()
    const id = setInterval(() => { void doFetch() }, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [obraId, enabled, intervalMs, triggerRefetch])

  return { apontamentos, loading, erro, ultimaAtualizacao, refetch }
}
