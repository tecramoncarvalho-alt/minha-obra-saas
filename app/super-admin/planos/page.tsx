'use client'

import { useState, useEffect } from 'react'

interface Plano {
  id: string; nome: string; max_users: number; max_projects: number;
  storage_limit: number; ativo: boolean; empresas_count: number;
}

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(0)} GB`
  return `${(b / 1e6).toFixed(0)} MB`
}

export default function SuperAdminPlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', max_users: '', max_projects: '', storage_limit: '' })
  const [criando, setCriando] = useState(false)

  const fetchPlanos = () =>
    fetch('/api/super-admin/planos').then(r => r.json()).then(d => {
      setPlanos(d.planos ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))

  useEffect(() => { fetchPlanos() }, [])

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCriando(true)
    await fetch('/api/super-admin/planos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome,
        max_users: parseInt(form.max_users),
        max_projects: parseInt(form.max_projects),
        storage_limit: parseInt(form.storage_limit) * 1024 * 1024 * 1024,
      }),
    })
    setForm({ nome: '', max_users: '', max_projects: '', storage_limit: '' })
    setShowForm(false)
    await fetchPlanos()
    setCriando(false)
  }

  const handleArquivar = async (id: string) => {
    if (!confirm('Arquivar este plano? Empresas existentes não serão afetadas.')) return
    await fetch(`/api/super-admin/planos/${id}`, { method: 'DELETE' })
    await fetchPlanos()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Planos ({planos.length})</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg"
        >
          + Novo Plano
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-white font-semibold mb-4">Criar Plano</h2>
          <form onSubmit={handleCriar} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'nome', label: 'Nome', placeholder: 'Pro' },
              { name: 'max_users', label: 'Máx. Usuários', placeholder: '20' },
              { name: 'max_projects', label: 'Máx. Obras', placeholder: '20' },
              { name: 'storage_limit', label: 'Storage (GB)', placeholder: '10' },
            ].map(f => (
              <div key={f.name}>
                <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                <input
                  type={f.name === 'nome' ? 'text' : 'number'}
                  value={form[f.name as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                  placeholder={f.placeholder} required
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
                />
              </div>
            ))}
            <div className="col-span-2 md:col-span-4 flex gap-3">
              <button type="submit" disabled={criando}
                className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50">
                {criando ? 'Criando...' : 'Criar Plano'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-200 text-sm px-3 py-2">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {planos.map(p => (
          <div key={p.id} className={`bg-slate-800 rounded-xl border p-6 ${p.ativo ? 'border-slate-700' : 'border-slate-800 opacity-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-lg">{p.nome}</h3>
              {!p.ativo && <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">Arquivado</span>}
            </div>
            <div className="space-y-1.5 text-sm text-slate-300">
              <p>👥 Até {p.max_users} usuários</p>
              <p>🏗️ Até {p.max_projects} obras</p>
              <p>💾 {fmtBytes(p.storage_limit)} de storage</p>
              <p className="text-slate-400 text-xs">{p.empresas_count} empresas neste plano</p>
            </div>
            {p.ativo && (
              <button onClick={() => handleArquivar(p.id)}
                className="mt-4 text-xs text-red-400 hover:text-red-300 font-semibold">
                Arquivar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
