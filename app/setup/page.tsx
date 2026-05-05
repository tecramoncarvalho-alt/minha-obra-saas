'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetupPage() {
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fallback = setTimeout(() => setChecking(false), 5000)
    const verificar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { clearTimeout(fallback); router.replace('/login'); return }

      const { data } = await supabase
        .from('usuarios_empresas')
        .select('empresa_id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      clearTimeout(fallback)
      if (data?.empresa_id) {
        window.location.href = '/'
      } else {
        setChecking(false)
      }
    }
    verificar().catch(() => { clearTimeout(fallback); setChecking(false) })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nomeEmpresa.trim()) return
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    // Cria empresa
    const { data: empresa, error: errEmpresa } = await supabase
      .from('empresas')
      .insert({ nome: nomeEmpresa.trim() })
      .select()
      .single()

    if (errEmpresa || !empresa) {
      setError('Erro ao criar empresa. Tente novamente.')
      setLoading(false)
      return
    }

    // Vincula usuário como admin
    const { error: errVinculo } = await supabase
      .from('usuarios_empresas')
      .insert({ user_id: user.id, empresa_id: empresa.id, role: 'admin' })

    if (errVinculo) {
      setError('Erro ao vincular usuário. Tente novamente.')
      setLoading(false)
      return
    }

    window.location.href = '/'
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
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

        <h2 className="text-2xl font-bold text-slate-900 mb-1">Configure sua empresa</h2>
        <p className="text-slate-500 text-sm mb-6">
          Dê um nome para sua empresa. Você poderá convidar outros membros depois.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome da empresa *
            </label>
            <input
              type="text"
              value={nomeEmpresa}
              onChange={e => setNomeEmpresa(e.target.value)}
              required
              placeholder="Ex: Construtora Silva & Associados"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !nomeEmpresa.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Criando...' : 'Começar a usar'}
          </button>
        </form>
      </div>
    </div>
  )
}
