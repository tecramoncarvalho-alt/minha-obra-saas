'use client'

import Link from 'next/link'
import { useAuth } from '@/app/providers'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  planejador: 'Planejador',
  operator: 'Operador',
  viewer: 'Visualizador',
}

export default function Header() {
  const { user, empresa, role, isOwner, isSuperAdmin, subscriptionStatus, signOut } = useAuth()

  if (!user || !empresa) return null

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      {subscriptionStatus === 'Past_Due' && (
        <div className="bg-red-600 text-white text-center text-xs py-2 font-semibold">
          ⚠️ Pagamento pendente — acesso em modo somente leitura. Regularize sua assinatura.
        </div>
      )}
      {subscriptionStatus === 'Trial' && (
        <div className="bg-amber-500 text-white text-center text-xs py-1.5 font-medium">
          Período Trial ativo — explore todas as funcionalidades gratuitamente.
        </div>
      )}
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg">🏗️</span>
          </div>
          <div>
            <span className="font-bold text-slate-900 text-base leading-tight block">Minha Obra</span>
            <span className="text-xs text-slate-500 leading-tight block">{empresa.nome}</span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <Link
              href="/super-admin"
              className="text-sm text-amber-600 hover:text-amber-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
            >
              👑 Super Admin
            </Link>
          )}

          {role === 'admin' && (
            <>
              <Link
                href="/admin/empresa"
                className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Empresa
              </Link>
              <Link
                href="/admin/membros"
                className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Membros
              </Link>
            </>
          )}

          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700 leading-tight">{user.email}</p>
              <div className="flex items-center gap-1 justify-end">
                <p className="text-xs text-slate-400 capitalize leading-tight">{ROLE_LABELS[role ?? ''] ?? role}</p>
                {isOwner && <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded-full leading-tight">owner</span>}
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-sm text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
