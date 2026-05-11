import { db, type PendingApontamento } from './offline-db'

export interface SyncResult {
  sincronizados: number
  conflitos: number
  erros: number
}

export interface ConflictInfo {
  localId: number
  atividadeId: number
  serverVersion: Record<string, unknown>
}

async function fileFromBase64(pending: PendingApontamento): Promise<File | null> {
  if (!pending.arquivoBase64 || !pending.arquivoMime || !pending.arquivoNome) return null
  const bytes = Uint8Array.from(atob(pending.arquivoBase64), c => c.charCodeAt(0))
  return new File([bytes], pending.arquivoNome, { type: pending.arquivoMime })
}

export async function sincronizarPendentes(
  obraId: number,
  onConflict?: (info: ConflictInfo) => void
): Promise<SyncResult> {
  const pendentes = await db.pendingApontamentos
    .where('obraId').equals(obraId)
    .and(p => !p.conflito)
    .sortBy('createdAt')

  let sincronizados = 0
  let conflitos = 0
  let erros = 0

  for (const pending of pendentes) {
    try {
      const payload = {
        atividade_id: pending.atividadeId,
        data: pending.data,
        efetivo_real: pending.efetivo_real,
        percentual_executado: pending.percentual_executado,
        observacao: pending.observacao,
        status: pending.status,
        clientCreatedAt: new Date(pending.createdAt).toISOString(),
      }

      const res = await fetch(`/api/obras/${pending.obraId}/apontamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { serverVersion?: Record<string, unknown> }
        await db.pendingApontamentos.update(pending.localId!, {
          conflito: true,
          servidorVersion: JSON.stringify(body.serverVersion ?? {}),
        })
        conflitos++
        onConflict?.({
          localId: pending.localId!,
          atividadeId: pending.atividadeId,
          serverVersion: body.serverVersion ?? {},
        })
        continue
      }

      if (!res.ok) {
        await db.pendingApontamentos.update(pending.localId!, {
          tentativas: pending.tentativas + 1,
          erroUltimo: `HTTP ${res.status}`,
        })
        erros++
        continue
      }

      const { apontamento } = await res.json() as { apontamento: { id: string } }

      // Tenta enviar foto vinculada se houver
      const arquivo = await fileFromBase64(pending)
      if (arquivo && apontamento?.id) {
        const formData = new FormData()
        formData.append('arquivo', arquivo, pending.arquivoNome!)
        formData.append('atividade_id', String(pending.atividadeId))
        formData.append('data_medicao', pending.data)
        formData.append('apontamento_id', apontamento.id)
        await fetch('/api/medicoes/upload', { method: 'POST', body: formData }).catch(() => null)
      }

      await db.pendingApontamentos.delete(pending.localId!)
      sincronizados++
    } catch {
      await db.pendingApontamentos.update(pending.localId!, {
        tentativas: pending.tentativas + 1,
        erroUltimo: 'Erro de rede',
      }).catch(() => null)
      erros++
    }
  }

  return { sincronizados, conflitos, erros }
}

export async function resolverConflito(localId: number, acao: 'sobrescrever' | 'descartar'): Promise<void> {
  if (acao === 'descartar') {
    await db.pendingApontamentos.delete(localId)
    return
  }
  // sobrescrever: reativar como pendente normal para tentar novamente com force
  await db.pendingApontamentos.update(localId, { conflito: false, tentativas: 0, erroUltimo: undefined })
}

export async function contarPendentes(obraId: number): Promise<number> {
  return db.pendingApontamentos.where('obraId').equals(obraId).count()
}
