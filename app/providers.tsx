'use client'

import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { Role, EmpresaDetalhada, Plano } from '@/app/lib/types'

interface AuthContextType {
  user: User | null
  empresa: EmpresaDetalhada | null
  role: Role | null
  isOwner: boolean
  isSuperAdmin: boolean
  subscriptionStatus: 'Active' | 'Trial' | 'Past_Due' | null
  plano: Plano | null
  signOut: () => Promise<void>
  loading: boolean
  empresaFetched: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  empresa: null,
  role: null,
  isOwner: false,
  isSuperAdmin: false,
  subscriptionStatus: null,
  plano: null,
  signOut: async () => {},
  loading: true,
  empresaFetched: false,
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  const [user, setUser] = useState<User | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaDetalhada | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [empresaFetched, setEmpresaFetched] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const loadEmpresa = async () => {
    try {
      const res = await fetch('/api/me')
      if (!res.ok) {
        console.error('[loadEmpresa] /api/me status:', res.status)
        return
      }
      const data = await res.json()
      setEmpresa(data.empresa ?? null)
      setRole(data.role ?? null)
      setIsOwner(data.isOwner ?? false)
      setIsSuperAdmin(data.isSuperAdmin ?? false)
      setEmpresaFetched(true)
    } catch {
      console.error('[loadEmpresa] erro de rede ao chamar /api/me')
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
          setIsOwner(false)
          setIsSuperAdmin(false)
          setEmpresaFetched(true)
        }
        setLoading(false)
      }
    )
    return () => { subscription.unsubscribe(); clearTimeout(failsafe) }
  }, [])

  useEffect(() => {
    if (!loading && empresaFetched && user && !empresa && !pathname.startsWith('/onboarding')) {
      router.replace('/onboarding')
    }
  }, [loading, empresaFetched, user, empresa, pathname])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const subscriptionStatus = empresa?.subscription_status ?? null
  const plano = empresa?.plano ?? null

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{
        user, empresa, role, isOwner, isSuperAdmin,
        subscriptionStatus, plano,
        signOut, loading, empresaFetched,
      }}>
        {children}
      </AuthContext.Provider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
