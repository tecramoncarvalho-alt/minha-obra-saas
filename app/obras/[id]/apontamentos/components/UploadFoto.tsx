'use client'

import { useRef, useState, useCallback } from 'react'
import { getMedicaoClienteSchema } from '@/app/lib/schemas'
import { uploadFotoComRetry } from '@/app/lib/upload-helper'

interface Props {
  empresaId: string
  obraId: number
  atividadeId: number
  onUploadSucesso: (fotoUrl: string) => void
  onUploadErro: (msg: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadFoto({ empresaId, obraId: _obraId, atividadeId, onUploadSucesso, onUploadErro }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<'idle' | 'comprimindo' | 'enviando' | 'sucesso' | 'erro'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [drag, setDrag] = useState(false)
  const [tentativaAtual, setTentativaAtual] = useState(0)
  const [tamanhos, setTamanhos] = useState<{ original: number; comprimido: number } | null>(null)
  const [erroMsg, setErroMsg] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [toastTipo, setToastTipo] = useState<'sucesso' | 'erro'>('sucesso')

  const mostrarToast = useCallback((msg: string, tipo: 'sucesso' | 'erro') => {
    setToastMsg(msg)
    setToastTipo(tipo)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
  }, [])

  const processar = async (file: File) => {
    const schema = getMedicaoClienteSchema()
    const validacao = schema.shape.arquivo.safeParse(file)
    if (!validacao.success) {
      onUploadErro(validacao.error.issues[0].message)
      return
    }

    setStatus('comprimindo')
    setProgresso(0)
    setErroMsg('')
    setTamanhos(null)
    setTentativaAtual(0)

    try {
      const result = await uploadFotoComRetry({
        file,
        empresaId,
        atividadeId,
        onProgress: (pct) => {
          setProgresso(pct)
          if (pct > 30) setStatus('enviando')
        },
        onRetry: (t, max) => {
          setTentativaAtual(t)
          mostrarToast(`⚠️ Erro ao salvar. Tentando novamente (${t}/${max})...`, 'erro')
        },
      })
      setTamanhos({ original: file.size, comprimido: result.tamanhoComprimido })
      setStatus('sucesso')
      setPreview(result.foto_url)
      onUploadSucesso(result.foto_url)
      mostrarToast('✓ Foto salva com sucesso', 'sucesso')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar foto.'
      setErroMsg(msg)
      setStatus('erro')
      onUploadErro(msg)
    }
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

  const resetar = () => {
    setStatus('idle')
    setPreview(null)
    setProgresso(0)
    setErroMsg('')
    setTamanhos(null)
    setTentativaAtual(0)
  }

  if (status === 'sucesso' && preview) {
    return (
      <div className="relative mt-2">
        <div className="flex items-center gap-3">
          <img src={preview} alt="Foto enviada" className="h-16 w-16 object-cover rounded border border-gray-200" />
          <div>
            <p className="text-sm text-green-600 font-medium">Foto enviada com sucesso</p>
            {tamanhos && (
              <p className="text-xs text-gray-400 mt-0.5">
                {formatBytes(tamanhos.original)} → {formatBytes(tamanhos.comprimido)}
              </p>
            )}
            <button onClick={resetar} className="text-xs text-gray-500 underline mt-1">
              Enviar outra
            </button>
          </div>
        </div>
        {toastMsg && <Toast msg={toastMsg} tipo={toastTipo} />}
      </div>
    )
  }

  const emProgresso = status === 'comprimindo' || status === 'enviando'

  return (
    <div className="relative mt-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => status === 'idle' && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors
          ${drag ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${status !== 'idle' ? 'pointer-events-none cursor-default' : 'cursor-pointer'}`}
      >
        {status === 'idle' && (
          <p className="text-sm text-gray-500">
            📷 Arraste uma foto ou{' '}
            <span className="text-blue-600 underline">clique para selecionar</span>
          </p>
        )}

        {emProgresso && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {status === 'comprimindo'
                ? 'Comprimindo...'
                : tentativaAtual > 0
                  ? <span className="text-amber-600">Tentando novamente... ({tentativaAtual}/3)</span>
                  : `Enviando... ${progresso}%`}
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
          <div className="space-y-1">
            <p className="text-sm text-red-600">⚠️ {erroMsg}</p>
            <button
              onClick={(e) => { e.stopPropagation(); resetar() }}
              className="text-xs text-blue-600 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      {toastMsg && <Toast msg={toastMsg} tipo={toastTipo} />}
    </div>
  )
}

function Toast({ msg, tipo }: { msg: string; tipo: 'sucesso' | 'erro' }) {
  return (
    <div className={`absolute bottom-2 right-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-md pointer-events-none
      ${tipo === 'sucesso' ? 'bg-green-600' : 'bg-amber-600'}`}>
      {msg}
    </div>
  )
}
