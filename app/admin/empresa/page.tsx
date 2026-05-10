'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/app/providers'

export default function AdminEmpresaPage() {
  const { empresa, role, isOwner, plano, subscriptionStatus, loading: authLoading } = useAuth()
  const router = useRouter()

  const [form, setForm] = useState({ nome: '', cnpj: '', endereco: '', email_cadastro: '', email_recuperacao: '' })
  const [obrasCount, setObrasCount] = useState(0)
  const [membrosCount, setMembrosCount] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!authLoading && role !== 'admin') router.replace('/')
  }, [authLoading, role])

  useEffect(() => {
    if (empresa) {
      setForm({
        nome: empresa.nome ?? '',
        cnpj: empresa.cnpj ?? '',
        endereco: empresa.endereco ?? '',
        email_cadastro: empresa.email_cadastro ?? '',
        email_recuperacao: empresa.email_recuperacao ?? '',
      })
    }
  }, [empresa])

  useEffect(() => {
    if (!empresa) return
    fetch(`/api/super-admin/empresas/${empresa.id}/stats`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setObrasCount(d.obras_count ?? 0); setMembrosCount(d.membros_count ?? 0) }
    }).catch(() => {})
  }, [empresa])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setMsg(null)
    const res = await fetch('/api/admin/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setMsg(res.ok ? { tipo: 'ok', texto: 'Dados salvos com sucesso.' } : { tipo: 'erro', texto: json.error ?? 'Erro ao salvar.' })
    setSalvando(false)
  }

  const handleDeletar = async () => {
    if (!confirm(`Tem certeza que deseja deletar a empresa "${empresa?.nome}"? Esta ação é irreversível.`)) return
    if (!confirm('Confirme novamente: todos os dados serão perdidos permanentemente.')) return

    const res = await fetch('/api/admin/empresa', { method: 'DELETE' })
    if (res.ok) {
      window.location.href = '/login'
    } else {
      const json = await res.json()
      alert(json.error ?? 'Erro ao deletar empresa.')
    }
  }

  const copiarCodigo = () => {
    if (empresa?.codigo_empresa) {
      navigator.clipboard.writeText(empresa.codigo_empresa)
      setMsg({ tipo: 'ok', texto: 'Código copiado!' })
      setTimeout(() => setMsg(null), 2000)
    }
  }

  const statusConfig = {
    Active: { label: 'Ativa', bg: 'bg-green-100 text-green-700' },
    Trial: { label: 'Trial', bg: 'bg-yellow-100 text-yellow-700' },
    Past_Due: { label: 'Pagamento Pendente', bg: 'bg-red-100 text-red-700' },
  }
  const statusAtual = subscriptionStatus ? statusConfig[subscriptionStatus] : null

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações da Empresa</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie os dados e o plano de <strong>{empresa?.nome}</strong></p>
        </div>

        {subscriptionStatus === 'Past_Due' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-semibold text-sm">⚠️ Pagamento pendente — criação e edição bloqueadas</p>
            <p className="text-red-500 text-xs mt-1">Regularize sua assinatura para retomar o acesso completo.</p>
          </div>
        )}

        {/* ID e Plano */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Identificação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Código da Empresa</p>
              <button onClick={copiarCodigo} className="text-2xl font-mono font-bold text-blue-600 hover:text-blue-700 tracking-widest">
                {empresa?.codigo_empresa ?? '—'}
              </button>
              <p className="text-xs text-slate-400 mt-1">Clique para copiar</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Plano Atual</p>
              <p className="text-lg font-bold text-slate-900">{plano?.nome ?? 'Free'}</p>
              {statusAtual && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusAtual.bg}`}>
                  {statusAtual.label}
                </span>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-2">Uso</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>Obras</span>
                    <span>{obrasCount}/{plano?.max_projects ?? '∞'}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 rounded-full h-1.5"
                      style={{ width: `${plano?.max_projects ? Math.min(100, (obrasCount / plano.max_projects) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>Membros</span>
                    <span>{membrosCount}/{plano?.max_users ?? '∞'}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 rounded-full h-1.5"
                      style={{ width: `${plano?.max_users ? Math.min(100, (membrosCount / plano.max_users) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Formulário de dados */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Dados Cadastrais</h2>
          <form onSubmit={handleSalvar} className="space-y-4">
            {[
              { name: 'nome', label: 'Nome da empresa *', type: 'text', required: true },
              { name: 'cnpj', label: 'CNPJ', type: 'text' },
              { name: 'endereco', label: 'Endereço', type: 'text' },
              { name: 'email_cadastro', label: 'E-mail de cadastro', type: 'email' },
              { name: 'email_recuperacao', label: 'E-mail de recuperação', type: 'email' },
            ].map(f => (
              <div key={f.name}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                <input
                  type={f.type} name={f.name}
                  value={form[f.name as keyof typeof form]}
                  onChange={handleChange}
                  required={f.required}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
            ))}

            {msg && (
              <p className={`text-sm px-3 py-2 rounded-lg border ${
                msg.tipo === 'ok' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'
              }`}>
                {msg.texto}
              </p>
            )}

            <button
              type="submit" disabled={salvando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              {salvando ? 'Salvando...' : 'Salvar Dados'}
            </button>
          </form>
        </div>

        {/* Zona de perigo */}
        {isOwner && (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-base font-semibold text-red-700 mb-2">Zona de Perigo</h2>
            <p className="text-sm text-slate-500 mb-4">
              Deletar a empresa remove permanentemente todos os dados: obras, atividades, apontamentos e membros.
              Esta ação <strong>não pode ser desfeita</strong>.
            </p>
            <button
              onClick={handleDeletar}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors"
            >
              Deletar Empresa
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
