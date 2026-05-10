'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function OnboardingCriarPage() {
  const [form, setForm] = useState({ nomeEmpresa: '', cnpj: '', endereco: '', email_cadastro: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nomeEmpresa.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/onboarding/criar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const json = await res.json()

    if (!res.ok) {
      if (res.status === 400 && json.error?.includes('já possui')) {
        window.location.href = '/'
        return
      }
      setError(json.error ?? 'Erro ao criar empresa.')
      setLoading(false)
      return
    }

    window.location.href = '/'
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

        <h2 className="text-2xl font-bold text-slate-900 mb-1">Criar Empresa</h2>
        <p className="text-slate-500 text-sm mb-6">
          Configure os dados da sua empresa. Apenas o nome é obrigatório.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome da empresa *</label>
            <input
              type="text" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} required
              placeholder="Ex: Construtora Silva & Associados"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ</label>
            <input
              type="text" name="cnpj" value={form.cnpj} onChange={handleChange}
              placeholder="00.000.000/0000-00"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Endereço</label>
            <input
              type="text" name="endereco" value={form.endereco} onChange={handleChange}
              placeholder="Rua, número, cidade/UF"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail de cadastro</label>
            <input
              type="email" name="email_cadastro" value={form.email_cadastro} onChange={handleChange}
              placeholder="contato@empresa.com.br"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit" disabled={loading || !form.nomeEmpresa.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Criando...' : 'Criar e Começar'}
          </button>

          <Link href="/onboarding" className="block text-center text-sm text-slate-500 hover:text-slate-700 mt-2">
            ← Voltar
          </Link>
        </form>
      </div>
    </div>
  )
}
