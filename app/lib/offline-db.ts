import Dexie, { type Table } from 'dexie'
import type { StatusAtividade } from './types'

export interface PendingApontamento {
  localId?: number
  obraId: number
  atividadeId: number
  data: string
  efetivo_real: number
  percentual_executado: number
  observacao: string
  status: StatusAtividade
  arquivoBase64?: string
  arquivoMime?: string
  arquivoNome?: string
  createdAt: number
  tentativas: number
  erroUltimo?: string
  conflito?: boolean
  servidorVersion?: string
}

class OfflineDB extends Dexie {
  pendingApontamentos!: Table<PendingApontamento, number>

  constructor() {
    super('minha-obra-offline')
    this.version(1).stores({
      pendingApontamentos: '++localId, obraId, atividadeId, data, createdAt, conflito',
    })
  }
}

export const db = new OfflineDB()
