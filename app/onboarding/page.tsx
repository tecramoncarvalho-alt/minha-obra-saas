'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'

export default function OnboardingPage() {
  const { empresa, loading, empresaFetched } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && empresaFetched && empresa) {
      router.replace('/')
    }
  }, [loading, empresaFetched, empresa])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-xl">🏗️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Minha Obra</h1>
            <p className="text-xs text-slate-500">Gestão com Linha de Balanço</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Bem-vindo!</h2>
        <p className="text-slate-500 text-center text-sm mb-8">
          Para começar, crie sua empresa ou entre em uma existente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/onboarding/criar"
            className="bg-white border-2 border-blue-200 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center gap-3 text-center transition-all hover:shadow-md group"
          >
            <div className="w-14 h-14 bg-blue-100 group-hover:bg-blue-600 rounded-2xl flex items-center justify-center transition-colors">
              <span className="text-2xl">🏢</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">Criar Empresa</p>
              <p className="text-slate-500 text-xs mt-1">Registre uma nova empresa e comece a gestão de obras</p>
            </div>
          </Link>

          <Link
            href="/onboarding/buscar"
            className="bg-white border-2 border-slate-200 hover:border-slate-400 rounded-2xl p-6 flex flex-col items-center gap-3 text-center transition-all hover:shadow-md group"
          >
            <div className="w-14 h-14 bg-slate-100 group-hover:bg-slate-700 rounded-2xl flex items-center justify-center transition-colors">
              <span className="text-2xl">🔍</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">Entrar em Empresa</p>
              <p className="text-slate-500 text-xs mt-1">Busque pelo código de 8 dígitos e solicite acesso</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
