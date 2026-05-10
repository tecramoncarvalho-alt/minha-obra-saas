'use client'

import { useState, useEffect } from 'react'

interface Empresa {
  id: string; nome: string; subscription_status: string | null;
  obras_count: number; membros_count: number; created_at: string;
  planos: { nome: string } | null
}

export default function SuperAdminDashboard() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/super-admin/empresas').then(r => r.json()).then(d => {
      setEmpresas(d.empresas ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const total = empresas.length
  const active = empresas.filter(e => e.subscription_status === 'Active').length
  const trial = empresas.filter(e => e.subscription_status === 'Trial').length
  const pastDue = empresas.filter(e => e.subscription_status === 'Past_Due').length
  const totalObras = empresas.reduce((acc, e) => acc + e.obras_count, 0)
  const totalMembros = empresas.reduce((acc, e) => acc + e.membros_count, 0)

  const ultimos7 = empresas.filter(e => {
    const d = new Date(e.created_at)
    return d >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }).length

  const cards = [
    { label: 'Empresas', value: total, icon: '🏢', color: 'text-blue-400' },
    { label: 'Ativas', value: active, icon: '✅', color: 'text-green-400' },
    { label: 'Trial', value: trial, icon: '⏳', color: 'text-yellow-400' },
    { label: 'Pendentes', value: pastDue, icon: '⚠️', color: 'text-red-400' },
    { label: 'Total Obras', value: totalObras, icon: '🏗️', color: 'text-purple-400' },
    { label: 'Total Membros', value: totalMembros, icon: '👥', color: 'text-cyan-400' },
    { label: 'Novos (7d)', value: ultimos7, icon: '📈', color: 'text-emerald-400' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard Global</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {cards.map(c => (
              <div key={c.label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <p className="text-2xl mb-1">{c.icon}</p>
                <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-slate-400 text-xs mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-white font-semibold mb-4">Empresas Recentes</h2>
            <div className="space-y-2">
              {empresas.slice(0, 10).map(e => (
                <div key={e.id} className="flex items-center justify-between gap-4 py-2 border-b border-slate-700 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{e.nome}</p>
                    <p className="text-slate-400 text-xs">{new Date(e.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{e.obras_count} obras</span>
                    <span>{e.membros_count} membros</span>
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      e.subscription_status === 'Active' ? 'bg-green-900 text-green-400' :
                      e.subscription_status === 'Trial' ? 'bg-yellow-900 text-yellow-400' :
                      'bg-red-900 text-red-400'
                    }`}>
                      {e.subscription_status ?? 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
