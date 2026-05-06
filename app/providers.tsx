'use client'

import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface Empresa {
  id: string
  nome: string
}

type Role = 'admin' | 'editor' | 'viewer'

interface AuthContextType {
  user: User | null
  empresa: Empresa | null
  role: Role | null
  signOut: () => Promise<void>
  loading: boolean
  empresaFetched: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  empresa: null,
  role: null,
  signOut: async () => {},
  loading: true,
  empresaFetched: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [empresaFetched, setEmpresaFetched] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  // Busca empresa via API server-side (service_role — sem RLS, sem deps de env var no browser)
  const loadEmpresa = async () => {
    try {
      const res = await fetch('/api/me')
      if (!res.ok) {
        console.error('[loadEmpresa] /api/me status:', res.status)
        return // erro no servidor — não redireciona para /setup
      }
      const { empresa: emp, role: r } = await res.json()
      setEmpresa(emp ?? null)
      setRole(r ?? null)
      setEmpresaFetched(true)
    } catch {
      console.error('[loadEmpresa] erro de rede ao chamar /api/me')
      // erro de rede — não redireciona para /setup
    }
  }

  useEffect(() => {
    const failsafe = setTimeout(() => setLoading(false), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadEmpresa()
      } else {
        setEmpresaFetched(true)
      }
      clearTimeout(failsafe)
      setLoading(false)
    }).catch(() => { clearTimeout(failsafe); setLoading(false); setEmpresaFetched(true) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadEmpresa()
        } else {
          setEmpresa(null)
          setRole(null)
          setEmpresaFetched(true)
        }
        setLoading(false)
      }
    )
    return () => { subscription.unsubscribe(); clearTimeout(failsafe) }
  }, [])

  // Redireciona para /setup apenas quando confirmado que não há empresa
  useEffect(() => {
    if (!loading && empresaFetched && user && !empresa && pathname !== '/setup') {
      router.replace('/setup')
    }
  }, [loading, empresaFetched, user, empresa, pathname])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, empresa, role, signOut, loading, empresaFetched }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
