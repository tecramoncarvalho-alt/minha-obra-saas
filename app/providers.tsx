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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  empresa: null,
  role: null,
  signOut: async () => {},
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const loadEmpresa = async (userId: string) => {
    // Two-step query: avoid embedded join which can return null due to RLS on empresas table
    const { data: membership, error } = await supabase
      .from('usuarios_empresas')
      .select('role, empresa_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) console.error('[loadEmpresa] erro membership:', error.code, error.message)
    if (!membership?.empresa_id) { setEmpresa(null); setRole(null); return }

    setRole(membership.role as Role)

    const { data: emp, error: empError } = await supabase
      .from('empresas')
      .select('id, nome')
      .eq('id', membership.empresa_id)
      .maybeSingle()

    if (empError) console.error('[loadEmpresa] erro empresa:', empError.code, empError.message)
    if (emp) setEmpresa(emp as Empresa)
    else setEmpresa(null)
  }

  useEffect(() => {
    // Failsafe: if getSession() or loadEmpresa() hang (e.g. network issue or
    // incompatible API key format), release the loading state after 8 seconds
    const failsafe = setTimeout(() => setLoading(false), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        try { await loadEmpresa(session.user.id) } catch { setEmpresa(null); setRole(null) }
      }
      clearTimeout(failsafe)
      setLoading(false)
    }).catch(() => { clearTimeout(failsafe); setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        // INITIAL_SESSION is handled by getSession() above
        // TOKEN_REFRESHED only rotates the token — empresa is already loaded
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        setUser(session?.user ?? null)
        if (session?.user) {
          try {
            await loadEmpresa(session.user.id)
          } catch {
            setEmpresa(null)
            setRole(null)
          }
        } else {
          setEmpresa(null)
          setRole(null)
        }
        setLoading(false)
      }
    )
    return () => { subscription.unsubscribe(); clearTimeout(failsafe) }
  }, [])

  // Redireciona para /setup se autenticado mas sem empresa vinculada
  useEffect(() => {
    if (!loading && user && !empresa && pathname !== '/setup') {
      router.replace('/setup')
    }
  }, [loading, user, empresa, pathname])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, empresa, role, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
