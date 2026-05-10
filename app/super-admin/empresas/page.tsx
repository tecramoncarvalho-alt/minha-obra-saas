'use client'

import { useState, useEffect } from 'react'

interface Empresa {
  id: string; nome: string; codigo_empresa: string | null;
  subscription_status: string | null; expires_at: string | null;
  obras_count: number; membros_count: number; created_at: string;
  planos: { nome: string } | null
}

interface Plano { id: string; nome: string }

const STATUS_OPTS = ['Active', 'Trial', 'Past_Due']

export default function SuperAdminEmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/super-admin/empresas').then(r => r.json()),
      fetch('/api/super-admin/planos').then(r => r.json()),
    ]).then(([ed, pd]) => {
      setEmpresas(ed.empresas ?? [])
      setPlanos(pd.planos ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleEditar = (e: Empresa) => {
    setEditando(e.id)
    setForm({
      subscription_status: e.subscription_status ?? '',
      expires_at: e.expires_at ? e.expires_at.slice(0, 10) : '',
      plan_id: '',
    })
  }

  const handleSalvar = async (id: string) => {
    setSalvando(true)
    const payload: Record<string, string> = {}
    if (form.subscription_status) payload.subscription_status = form.subscription_status
    if (form.expires_at) payload.expires_at = new Date(form.expires_at).toISOString()
    if (form.plan_id) payload.plan_id = form.plan_id

    await fetch(`/api/super-admin/empresas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { empresas: atualizado } = await fetch('/api/super-admin/empresas').then(r => r.json())
    setEmpresas(atualizado ?? [])
    setEditando(null)
    setSalvando(false)
  }

  const handleDeletar = async (id: string, nome: string) => {
    if (!confirm(`Deletar empresa "${nome}"? Ação irreversível.`)) return
    await fetch(`/api/super-admin/empresas/${id}`, { method: 'DELETE' })
    setEmpresas(prev => prev.filter(e => e.id !== id))
  }

  const filtradas = empresas.filter(e =>
    e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (e.codigo_empresa ?? '').includes(busca)
  )

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Gestão de Empresas ({empresas.length})</h1>
        <input
          type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código..."
          className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm outline-none focus:border-yellow-400 w-64"
        />
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-slate-400 text-xs uppercase">
              {['Empresa', 'Código', 'Plano', 'Status', 'Obras', 'Membros', 'Criada em', 'Ações'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filtradas.map(e => (
              <>
                <tr key={e.id} className="text-slate-300 hover:bg-slate-750">
                  <td className="px-4 py-3 font-medium text-white">{e.nome}</td>
                  <td className="px-4 py-3 font-mono text-yellow-400">{e.codigo_empresa ?? '—'}</td>
                  <td className="px-4 py-3">{e.planos?.nome ?? 'Free'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      e.subscription_status === 'Active' ? 'bg-green-900 text-green-400' :
                      e.subscription_status === 'Trial' ? 'bg-yellow-900 text-yellow-400' :
                      'bg-red-900 text-red-400'
                    }`}>
                      {e.subscription_status ?? 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{e.obras_count}</td>
                  <td className="px-4 py-3">{e.membros_count}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(e.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEditar(e)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">Editar</button>
                      <button onClick={() => handleDeletar(e.id, e.nome)} className="text-xs text-red-400 hover:text-red-300 font-semibold">Deletar</button>
                    </div>
                  </td>
                </tr>
                {editando === e.id && (
                  <tr className="bg-slate-900">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Status</label>
                          <select
                            value={form.subscription_status}
                            onChange={ev => setForm(prev => ({ ...prev, subscription_status: ev.target.value }))}
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
                          >
                            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Plano</label>
                          <select
                            value={form.plan_id}
                            onChange={ev => setForm(prev => ({ ...prev, plan_id: ev.target.value }))}
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
                          >
                            <option value="">Manter atual</option>
                            {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Expira em</label>
                          <input
                            type="date" value={form.expires_at}
                            onChange={ev => setForm(prev => ({ ...prev, expires_at: ev.target.value }))}
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSalvar(e.id)} disabled={salvando}
                            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-semibold text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            {salvando ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button onClick={() => setEditando(null)} className="text-slate-400 hover:text-slate-200 text-sm px-3 py-1.5">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
