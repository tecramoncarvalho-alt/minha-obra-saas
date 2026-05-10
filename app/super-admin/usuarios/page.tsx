'use client'

import { useState, useEffect } from 'react'

interface Usuario {
  user_id: string
  role: string
  is_owner: boolean
  created_at: string
  email: string | null
  empresas: { nome: string; codigo_empresa: string | null } | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', planejador: 'Planejador', operator: 'Operador', viewer: 'Visualizador',
}

export default function SuperAdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    fetch('/api/super-admin/usuarios').then(r => r.json()).then(d => {
      setUsuarios(d.usuarios ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtrados = usuarios.filter(u =>
    (u.email ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (u.empresas?.nome ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Usuários ({usuarios.length})</h1>
        <input
          type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por email ou empresa..."
          className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm outline-none focus:border-yellow-400 w-64"
        />
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-slate-400 text-xs uppercase">
              {['Email', 'Empresa', 'Código', 'Role', 'Owner', 'Desde'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filtrados.map(u => (
              <tr key={u.user_id} className="text-slate-300 hover:bg-slate-750">
                <td className="px-4 py-3 text-white">{u.email ?? '(sem email)'}</td>
                <td className="px-4 py-3">{u.empresas?.nome ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-yellow-400 text-xs">{u.empresas?.codigo_empresa ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3">{u.is_owner ? '✅' : '—'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
