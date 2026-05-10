import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isSuperAdmin } from '@/app/lib/super-admin'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = await isSuperAdmin(user.id)
  if (!isAdmin) redirect('/')

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xl">👑</span>
            <span className="text-white font-bold text-lg">Super Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {[
              { href: '/super-admin', label: 'Dashboard' },
              { href: '/super-admin/empresas', label: 'Empresas' },
              { href: '/super-admin/planos', label: 'Planos' },
              { href: '/super-admin/usuarios', label: 'Usuários' },
              { href: '/super-admin/logs', label: 'Logs' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-slate-300 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <a href="/" className="text-sm text-slate-400 hover:text-slate-200">← Voltar ao App</a>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
