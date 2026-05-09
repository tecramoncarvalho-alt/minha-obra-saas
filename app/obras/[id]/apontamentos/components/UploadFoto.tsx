'use client'

import { useRef, useState, useCallback } from 'react'
import { getMedicaoClienteSchema } from '@/app/lib/schemas'

interface Props {
  onFileSelecionado: (file: File | null) => void
  uploadStatus?: 'idle' | 'enviando' | 'sucesso' | 'erro'
  uploadProgresso?: number
  uploadErroMsg?: string
  fotoUrl?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadFoto({
  onFileSelecionado,
  uploadStatus = 'idle',
  uploadProgresso = 0,
  uploadErroMsg = '',
  fotoUrl,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [drag, setDrag] = useState(false)
  const [validacaoErro, setValidacaoErro] = useState('')

  const processar = useCallback((file: File) => {
    setValidacaoErro('')
    const schema = getMedicaoClienteSchema()
    const validacao = schema.shape.arquivo.safeParse(file)
    if (!validacao.success) {
      setValidacaoErro(validacao.error.issues[0].message)
      onFileSelecionado(null)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setFileName(file.name)
    setFileSize(file.size)
    onFileSelecionado(file)
  }, [onFileSelecionado, previewUrl])

  const remover = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFileName('')
    setFileSize(0)
    setValidacaoErro('')
    onFileSelecionado(null)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processar(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) processar(file)
  }

  if (uploadStatus === 'enviando') {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-sm text-gray-600">Enviando foto... {uploadProgresso}%</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgresso}%` }}
          />
        </div>
      </div>
    )
  }

  if (uploadStatus === 'sucesso' && fotoUrl) {
    return (
      <div className="flex items-center gap-3 mt-2">
        <img src={fotoUrl} alt="Foto salva" className="h-16 w-16 object-cover rounded border border-gray-200" />
        <div>
          <p className="text-sm text-green-600 font-medium">✓ Foto salva com sucesso</p>
          <p className="text-xs text-gray-400">{fileName}</p>
        </div>
      </div>
    )
  }

  if (uploadStatus === 'erro') {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-sm text-red-600">⚠️ {uploadErroMsg}</p>
        <button onClick={remover} className="text-xs text-blue-600 underline">
          Tentar com outro arquivo
        </button>
      </div>
    )
  }

  if (previewUrl) {
    return (
      <div className="flex items-center gap-3 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <img src={previewUrl} alt="Preview" className="h-14 w-14 object-cover rounded border border-blue-200 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 font-medium truncate">{fileName}</p>
          <p className="text-xs text-gray-400">{formatBytes(fileSize)}</p>
          <p className="text-xs text-blue-600 mt-0.5">Será salva ao salvar o apontamento</p>
        </div>
        <button
          onClick={remover}
          className="text-gray-400 hover:text-red-500 text-xl leading-none flex-shrink-0"
          title="Remover foto"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2">
      {validacaoErro && <p className="text-xs text-red-600 mb-1">⚠️ {validacaoErro}</p>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
          ${drag ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
      >
        <p className="text-sm text-gray-500">
          📷 Arraste ou{' '}
          <span className="text-blue-600 underline">clique para selecionar</span>
        </p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </div>
  )
}
