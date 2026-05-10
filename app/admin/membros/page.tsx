'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Header from '@/components/Header'
import type { Role } from '@/app/lib/types'

interface Membro {
  user_id: string
  role: Role
  is_owner: boolean
  created_at: string
  email: string | null
}

interface JoinReq {
  id: string
  user_id: string
  role: string
  created_at: string
  email: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  planejador: 'Planejador',
  operator: 'Operador',
  viewer: 'Visualizador',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  planejador: 'bg-blue-100 text-blue-700',
  operator: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export default function AdminMembrosPage() {
  const { empresa, role, user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [membros, setMembros] = useState<Membro[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinReq[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [roleConvite, setRoleConvite] = useState<'planejador' | 'operator' | 'viewer'>('planejador')
  const [enviando, setEnviando] = useState(false)
  const [msgConvite, setMsgConvite] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [roleApproval, setRoleApproval] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!authLoading && role !== 'admin') router.replace('/')
  }, [authLoading, role])

  useEffect(() => {
    if (!authLoading) { fetchMembros(); fetchJoinRequests() }
  }, [authLoading])

  const fetchMembros = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/membros')
    if (res.ok) {
      const body = await res.json()
      setMembros(body.membros ?? [])
    }
    setLoading(false)
  }

  const fetchJoinRequests = async () => {
    const res = await fetch('/api/admin/join-requests')
    if (res.ok) {
      const body = await res.json()
      setJoinRequests(body.requests ?? [])
    }
  }

  const handleAlterarRole = async (userId: string, novoRole: string) => {
    await fetch(`/api/admin/membros/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: novoRole }),
    })
    await fetchMembros()
  }

  const handleRemover = async (userId: string) => {
    if (!confirm('Remover este membro da empresa?')) return
    await fetch(`/api/admin/membros/${userId}/role`, { method: 'DELETE' })
    await fetchMembros()
  }

  const handleProcessarSolicitacao = async (reqId: string, action: 'approve' | 'reject') => {
    setApprovingId(reqId)
    await fetch(`/api/admin/join-requests/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, role: roleApproval[reqId] ?? 'viewer' }),
    })
    await fetchJoinRequests()
    await fetchMembros()
    setApprovingId(null)
  }

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setEnviando(true)
    setMsgConvite(null)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role: roleConvite, empresa_id: empresa?.id }),
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
          <h1 className="text-2xl font-bold text-slate-900">Membros</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie a equipe de <strong>{empresa?.nome}</strong></p>
        </div>

        {/* Solicitações pendentes */}
        {joinRequests.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-amber-800 mb-4">
              🔔 Solicitações de Entrada ({joinRequests.length})
            </h2>
            <div className="divide-y divide-amber-100 space-y-3">
              {joinRequests.map(req => (
                <div key={req.id} className="pt-3 first:pt-0 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{req.email ?? '(sem email)'}</p>
                    <p className="text-xs text-slate-500">Solicitado em {new Date(req.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={roleApproval[req.id] ?? 'viewer'}
                      onChange={e => setRoleApproval(prev => ({ ...prev, [req.id]: e.target.value }))}
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 outline-none"
                    >
                      <option value="planejador">Planejador</option>
                      <option value="operator">Operador</option>
                      <option value="viewer">Visualizador</option>
                    </select>
                    <button
                      onClick={() => handleProcessarSolicitacao(req.id, 'approve')}
                      disabled={approvingId === req.id}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleProcessarSolicitacao(req.id, 'reject')}
                      disabled={approvingId === req.id}
                      className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Convidar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Convidar por E-mail</h2>
          <form onSubmit={handleConvidar} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="email@exemplo.com"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 text-sm"
            />
            <select
              value={roleConvite}
              onChange={e => setRoleConvite(e.target.value as typeof roleConvite)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="planejador">Planejador</option>
              <option value="operator">Operador</option>
              <option value="viewer">Visualizador</option>
            </select>
            <button
              type="submit" disabled={enviando || !email.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              {enviando ? 'Enviando...' : 'Convidar'}
            </button>
          </form>

          {msgConvite && (
            <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
              msgConvite.tipo === 'ok' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'
            }`}>
              {msgConvite.texto}
            </p>
          )}
        </div>

        {/* Membros ativos */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Membros Ativos ({membros.length})</h2>
          <div className="divide-y divide-slate-100">
            {membros.map(m => {
              const emailMembro = m.email ?? '(sem email)'
              const isMe = m.user_id === user?.id
              const canEdit = !isMe && !m.is_owner
              return (
                <div key={m.user_id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{emailMembro}</p>
                      {isMe && <span className="text-xs text-slate-400">(você)</span>}
                      {m.is_owner && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Owner</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Desde {new Date(m.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canEdit ? (
                      <select
                        value={m.role}
                        onChange={e => handleAlterarRole(m.user_id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${ROLE_COLORS[m.role] ?? ''}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="planejador">Planejador</option>
                        <option value="operator">Operador</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role] ?? ''}`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    )}

                    {canEdit && (
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
