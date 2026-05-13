'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

interface Props {
  tvToken: string | null
  obraId: number
  onTokenRefreshed: () => void
}

export default function SharePanel({ tvToken, obraId, onTokenRefreshed }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [regenerando, setRegenerando] = useState(false)
  const [erro, setErro] = useState('')

  const url = tvToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/tv/${tvToken}`
    : null

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQrDataUrl).catch(() => null)
  }, [url])

  async function copiar() {
    if (!url) return
    await navigator.clipboard.writeText(url).catch(() => null)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function regenerar() {
    setRegenerando(true)
    setErro('')
    try {
      const res = await fetch(`/api/obras/${obraId}/tv-token`, { method: 'PATCH' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setErro(body.error ?? 'Erro ao regenerar link.')
      } else {
        onTokenRefreshed()
        setConfirmando(false)
      }
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setRegenerando(false)
    }
  }

  if (!tvToken) {
    return (
      <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-xl text-sm text-yellow-200">
        Link compartilhável não disponível. Execute a migration SQL para ativar:{' '}
        <code className="text-xs bg-yellow-900/40 px-1 rounded">
          ALTER TABLE obras ADD COLUMN IF NOT EXISTS tv_token uuid DEFAULT gen_random_uuid() UNIQUE;
        </code>
      </div>
    )
  }

  return (
    <div className="p-4 bg-gray-800/80 border border-gray-700 rounded-xl space-y-4">
      <div className="text-sm font-semibold text-gray-200">📺 Link do Dashboard TV</div>

      {/* URL */}
      <div className="flex gap-2">
        <input
          readOnly
          value={url ?? ''}
          className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 truncate"
        />
        <button
          type="button"
          onClick={copiar}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors flex-shrink-0"
          title="Copiar link"
        >
          {copiado ? '✅' : '📋'}
        </button>
        <a
          href={url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors flex-shrink-0"
          title="Abrir em nova aba"
        >
          🔗
        </a>
      </div>

      {/* QR Code */}
      {qrDataUrl && (
        <div className="flex justify-center">
          <div className="p-2 bg-white rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR Code do link da TV" width={140} height={140} />
          </div>
        </div>
      )}

      {/* Regenerar */}
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="w-full py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-sm rounded-lg transition-colors"
        >
          🔄 Regenerar link
        </button>
      ) : (
        <div className="bg-red-950/60 border border-red-800/60 rounded-lg p-3 space-y-3">
          <p className="text-sm text-red-200">
            O link atual será invalidado. Quem o tiver perderá acesso. Deseja continuar?
          </p>
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={regenerar}
              disabled={regenerando}
              className="flex-1 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {regenerando ? 'Aguarde…' : 'Sim, invalidar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
