'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers'
import Header from '@/components/Header'

interface Membro {
  user_id: string
  role: 'admin' | 'editor' | 'viewer'
  created_at: string
  users: { email: string } | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Visualizador',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export default function EquipePage() {
  const { empresa, role, user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [membros, setMembros] = useState<Membro[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [roleConvite, setRoleConvite] = useState<'editor' | 'viewer'>('editor')
  const [enviando, setEnviando] = useState(false)
  const [msgConvite, setMsgConvite] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      router.replace('/')
    }
  }, [authLoading, role])

  useEffect(() => {
    if (!authLoading && empresa) fetchMembros()
  }, [authLoading, empresa])

  const fetchMembros = async () => {
    if (!empresa) return
    setLoading(true)
    const { data } = await supabase
      .from('usuarios_empresas')
      .select('user_id, role, created_at, users:user_id(email)')
      .eq('empresa_id', empresa.id)
      .order('created_at')
    setMembros((data as Membro[]) || [])
    setLoading(false)
  }

  const handleAlterarRole = async (userId: string, novoRole: string) => {
    if (!empresa) return
    await supabase
      .from('usuarios_empresas')
      .update({ role: novoRole })
      .eq('empresa_id', empresa.id)
      .eq('user_id', userId)
    await fetchMembros()
  }

  const handleRemover = async (userId: string) => {
    if (!empresa || userId === user?.id) return
    if (!confirm('Remover este membro da empresa?')) return
    await supabase
      .from('usuarios_empresas')
      .delete()
      .eq('empresa_id', empresa.id)
      .eq('user_id', userId)
    await fetchMembros()
  }

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresa || !email.trim()) return
    setEnviando(true)
    setMsgConvite(null)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role: roleConvite, empresa_id: empresa.id }),
    })

    if (res.ok) {
      setMsgConvite({ tipo: 'ok', texto: `Convite enviado para ${email.trim()}` })
      setEmail('')
    } else {
      const body = await res.json().catch(() => ({}))
      setMsgConvite({ tipo: 'erro', texto: body.error || 'Erro ao enviar convite.' })
    }
    setEnviando(false)
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipe</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie os membros de <strong>{empresa?.nome}</strong></p>
        </div>

        {/* Convidar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Convidar membro</h2>
          <form onSubmit={handleConvidar} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="email@exemplo.com"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 text-sm"
            />
            <select
              value={roleConvite}
              onChange={e => setRoleConvite(e.target.value as 'editor' | 'viewer')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
            <button
              type="submit"
              disabled={enviando || !email.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              {enviando ? 'Enviando...' : 'Convidar'}
            </button>
          </form>

          {msgConvite && (
            <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
              msgConvite.tipo === 'ok'
                ? 'text-green-700 bg-green-50 border-green-200'
                : 'text-red-600 bg-red-50 border-red-200'
            }`}>
              {msgConvite.texto}
            </p>
          )}
        </div>

        {/* Lista de membros */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Membros ({membros.length})
          </h2>

          <div className="divide-y divide-slate-100">
            {membros.map(m => {
              const emailMembro = m.users?.email ?? '(sem email)'
              const isMe = m.user_id === user?.id
              return (
                <div key={m.user_id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {emailMembro}
                      {isMe && <span className="ml-2 text-xs text-slate-400">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Desde {new Date(m.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isMe ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={e => handleAlterarRole(m.user_id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${ROLE_COLORS[m.role]}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                    )}

                    {!isMe && (
                      <button
                        onClick={() => handleRemover(m.user_id)}
                        className="text-xs text-slate-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
