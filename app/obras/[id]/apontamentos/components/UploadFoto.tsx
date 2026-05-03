'use client'

import { useRef, useState } from 'react'
import { getMedicaoClienteSchema } from '@/app/lib/schemas'

interface Props {
  empresaId: string
  obraId: number
  atividadeId: number
  onUploadSucesso: (fotoUrl: string) => void
  onUploadErro: (msg: string) => void
}

export default function UploadFoto({ empresaId, obraId, atividadeId, onUploadSucesso, onUploadErro }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'comprimindo' | 'enviando' | 'sucesso' | 'erro'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [drag, setDrag] = useState(false)

  const processar = async (file: File) => {
    const schema = getMedicaoClienteSchema()
    const validacao = schema.shape.arquivo.safeParse(file)
    if (!validacao.success) {
      onUploadErro(validacao.error.issues[0].message)
      return
    }

    setStatus('comprimindo')
    setProgresso(10)

    let comprimido: File
    try {
      const imageCompression = (await import('browser-image-compression')).default
      comprimido = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        onProgress: (p) => setProgresso(10 + Math.round(p * 0.5)),
      })
    } catch {
      setStatus('erro')
      onUploadErro('Erro ao comprimir imagem.')
      return
    }

    // Verifica quota antes de enviar
    try {
      const res = await fetch(`/api/empresa/${empresaId}/storage-quota`)
      if (res.ok) {
        const quota = await res.json()
        if (quota.percentual_usado >= 100) {
          setStatus('erro')
          onUploadErro('Quota de storage esgotada. Contate o administrador.')
          return
        }
      }
    } catch {
      // Não bloqueia o upload por falha na checagem de quota
    }

    setStatus('enviando')
    setProgresso(65)

    const formData = new FormData()
    formData.append('arquivo', comprimido, file.name)
    formData.append('atividade_id', String(atividadeId))
    formData.append('data_medicao', new Date().toISOString().slice(0, 10))

    try {
      const res = await fetch('/api/medicoes/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error ?? 'Erro no upload.')
      }
      const { foto_url } = await res.json()
      setProgresso(100)
      setStatus('sucesso')
      setPreview(foto_url)
      onUploadSucesso(foto_url)
    } catch (err) {
      setStatus('erro')
      const msg = err instanceof Error ? err.message : 'Erro ao enviar foto.'
      onUploadErro(msg)
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processar(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) processar(file)
  }

  if (status === 'sucesso' && preview) {
    return (
      <div className="flex items-center gap-3 mt-2">
        <img src={preview} alt="Foto enviada" className="h-16 w-16 object-cover rounded border border-gray-200" />
        <div className="text-sm text-green-600 font-medium">Foto enviada com sucesso</div>
        <button
          onClick={() => { setStatus('idle'); setPreview(null); setProgresso(0) }}
          className="text-xs text-gray-500 underline"
        >Enviar outra</button>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => status === 'idle' && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${drag ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${status !== 'idle' ? 'pointer-events-none' : ''}`}
      >
        {status === 'idle' && (
          <p className="text-sm text-gray-500">
            Arraste uma foto ou <span className="text-blue-600 underline">clique para selecionar</span>
          </p>
        )}
        {(status === 'comprimindo' || status === 'enviando') && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {status === 'comprimindo' ? 'Comprimindo...' : 'Enviando...'}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
        )}
        {status === 'erro' && (
          <p className="text-sm text-red-600">
            Erro ao enviar.{' '}
            <button
              onClick={(e) => { e.stopPropagation(); setStatus('idle'); setProgresso(0) }}
              className="underline"
            >Tentar novamente</button>
          </p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </div>
  )
}
