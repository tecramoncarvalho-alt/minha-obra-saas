import { useQuery } from '@tanstack/react-query'
import type { ApontamentoDiario, StorageQuota } from './types'

// ─── Quota de storage ────────────────────────────────────────────────────────
// Cache de 5 min: atualiza após upload via queryClient.invalidateQueries

export function useStorageQuota(empresaId: string | undefined) {
  return useQuery<StorageQuota>({
    queryKey: ['quota', empresaId],
    queryFn: async () => {
      const res = await fetch(`/api/empresa/${empresaId}/storage-quota`)
      if (!res.ok) throw new Error('Falha ao carregar quota de armazenamento.')
      return res.json()
    },
    enabled: !!empresaId,
  })
}

// ─── Apontamentos de um dia específico ───────────────────────────────────────
// Cache de 5 min: invalida após salvar apontamento
// NOTA para PWA: ponto de extensão para persistQueryClient + IndexedDB

export function useApontamentosHoje(
  obraId: number,
  data: string,
  enabled = true,
) {
  return useQuery<ApontamentoDiario[]>({
    queryKey: ['apontamentos', obraId, data],
    queryFn: async () => {
      const res = await fetch(`/api/obras/${obraId}/apontamentos?data=${data}`)
      if (!res.ok) throw new Error('Falha ao carregar apontamentos.')
      const json = await res.json()
      return json.apontamentos as ApontamentoDiario[]
    },
    enabled: enabled && !!obraId && !!data,
  })
}
