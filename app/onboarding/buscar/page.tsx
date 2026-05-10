'use client'

import { useState } from 'react'
import Link from 'next/link'

type Fase = 'buscar' | 'confirmar' | 'enviado'

export default function OnboardingBuscarPage() {
  const [codigo, setCodigo] = useState('')
  const [empresa, setEmpresa] = useState<{ id: string; nome: string } | null>(null)
  const [fase, setFase] = useState<Fase>('buscar')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (codigo.length !== 8) return
    setLoading(true)
    setError('')

    const res = await fetch(`/api/onboarding/buscar?codigo=${codigo}`)
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Empresa não encontrada.')
      setLoading(false)
      return
    }

    setEmpresa(json.empresa)
    setFase('confirmar')
    setLoading(false)
  }

  const handleSolicitar = async () => {
    if (!empresa) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/onboarding/buscar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresa.id, role: 'viewer' }),
    })

    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Erro ao enviar solicitação.')
      setLoading(false)
      return
    }

    setFase('enviado')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-xl">🏗️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Minha Obra</h1>
            <p className="text-xs text-slate-500">Gestão com Linha de Balanço</p>
          </div>
        </div>

        {fase === 'buscar' && (
          <>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Entrar em Empresa</h2>
            <p className="text-slate-500 text-sm mb-6">
              Informe o código de 8 dígitos fornecido pelo administrador da empresa.
            </p>
            <form onSubmit={handleBuscar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código da Empresa</label>
                <input
                  type="text" value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required maxLength={8} placeholder="00000000"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 text-center text-2xl font-mono tracking-widest"
                />
                <p className="text-xs text-slate-400 mt-1 text-center">{codigo.length}/8 dígitos</p>
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit" disabled={loading || codigo.length !== 8}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Buscando...' : 'Buscar Empresa'}
              </button>

              <Link href="/onboarding" className="block text-center text-sm text-slate-500 hover:text-slate-700 mt-2">
                ← Voltar
              </Link>
            </form>
          </>
        )}

        {fase === 'confirmar' && empresa && (
          <>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Confirmar Entrada</h2>
            <p className="text-slate-500 text-sm mb-6">Você deseja solicitar acesso a esta empresa?</p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-center">
              <p className="text-2xl mb-1">🏢</p>
              <p className="font-bold text-slate-900 text-lg">{empresa.nome}</p>
              <p className="text-xs text-slate-500 mt-1">Código: {codigo}</p>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
            )}

            <div className="space-y-2">
              <button
                onClick={handleSolicitar} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Enviando...' : 'Solicitar Acesso'}
              </button>
              <button
                onClick={() => { setFase('buscar'); setEmpresa(null); setError('') }}
                className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-lg transition-colors"
              >
                Voltar
              </button>
            </div>
          </>
        )}

        {fase === 'enviado' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Solicitação Enviada!</h2>
            <p className="text-slate-500 text-sm mb-6">
              Aguarde o administrador da empresa aprovar seu acesso. Você receberá um e-mail de confirmação.
            </p>
            <button
              onClick={() => window.location.href = '/login'}
              className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
            >
              Voltar ao Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
