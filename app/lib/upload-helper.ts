const BACKOFF_BASE_MS = 1000

export interface UploadOptions {
  file: File
  empresaId: string
  atividadeId: number
  apontamentoId?: string
  onProgress: (percentual: number) => void
  onRetry?: (tentativa: number, maxRetries: number) => void
  maxRetries?: number
}

export interface UploadResult {
  foto_url: string
  tamanhoOriginal: number
  tamanhoComprimido: number
}

export async function uploadFotoComRetry({
  file,
  empresaId,
  atividadeId,
  apontamentoId,
  onProgress,
  onRetry,
  maxRetries = 3,
}: UploadOptions): Promise<UploadResult> {
  const tamanhoOriginal = file.size

  // Fase 1: compressão (0–30%)
  onProgress(0)
  const imageCompression = (await import('browser-image-compression')).default
  let comprimido: File
  try {
    comprimido = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      onProgress: (p) => onProgress(Math.round(p * 0.3)),
    })
  } catch {
    throw new Error('Falha ao comprimir a imagem.')
  }
  onProgress(30)

  // Verificação de quota (não bloqueia em caso de falha na verificação)
  try {
    const res = await fetch(`/api/empresa/${empresaId}/storage-quota`)
    if (res.ok) {
      const { percentual_usado } = await res.json() as { percentual_usado: number }
      if (percentual_usado >= 100) throw new Error('Quota de storage esgotada. Contate o administrador.')
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Quota')) throw err
  }

  // Fase 2: upload com retry (30–100%)
  const formData = new FormData()
  formData.append('arquivo', comprimido, file.name)
  formData.append('atividade_id', String(atividadeId))
  formData.append('data_medicao', new Date().toISOString().slice(0, 10))
  if (apontamentoId) formData.append('apontamento_id', apontamentoId)

  let ultimoErro = new Error('Falha no upload.')

  for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
    if (tentativa > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, Math.pow(2, tentativa - 1) * BACKOFF_BASE_MS))
      onRetry?.(tentativa, maxRetries)
    }
    onProgress(30 + Math.round(((tentativa + 1) / (maxRetries + 1)) * 40))

    let res: Response
    try {
      res = await fetch('/api/medicoes/upload', { method: 'POST', body: formData })
    } catch {
      ultimoErro = new Error('Erro de conexão. Verifique sua internet.')
      continue
    }

    if (res.ok) {
      const { foto_url } = await res.json() as { foto_url: string }
      onProgress(100)
      return { foto_url, tamanhoOriginal, tamanhoComprimido: comprimido.size }
    }

    const body = await res.json().catch(() => ({})) as { error?: string }
    const msg = body.error ?? `Erro ${res.status} no servidor.`

    if (res.status === 413) throw new Error('Imagem muito grande mesmo após compressão.')
    if (res.status === 400) throw new Error(msg)
    if (res.status === 401) throw new Error('Sessão expirada. Faça login novamente.')
    if (res.status === 403) throw new Error('Sem permissão para enviar fotos.')

    ultimoErro = new Error(msg)
  }

  throw new Error(`${ultimoErro.message} Não foi possível enviar após ${maxRetries} tentativas.`)
}
