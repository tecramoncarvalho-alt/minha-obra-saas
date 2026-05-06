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

  const loadEmpresa = async (userId: string) => {
    // Two-step query: avoid embedded join which can return null due to RLS on empresas table
    // Retry once on DB error — Supabase free tier can be slow on cold start
    const membershipQuery = () => supabase
      .from('usuarios_empresas')
      .select('role, empresa_id')
      .eq('user_id', userId)
      .maybeSingle()

    let { data: membership, error } = await membershipQuery()

    if (error) {
      console.error('[loadEmpresa] erro membership (tentativa 1):', error.code)
      await new Promise(r => setTimeout(r, 3000))
      ;({ data: membership, error } = await membershipQuery())
      if (error) {
        console.error('[loadEmpresa] erro membership (tentativa 2):', error.code)
        setEmpresa(null); setRole(null)
        return // DB indisponível — não redireciona para /setup
      }
    }

    if (!membership?.empresa_id) { setEmpresa(null); setRole(null); setEmpresaFetched(true); return }

    setRole(membership.role as Role)

    const { data: emp, error: empError } = await supabase
      .from('empresas')
      .select('id, nome')
      .eq('id', membership.empresa_id)
      .maybeSingle()

    if (empError) {
      console.error('[loadEmpresa] erro empresa:', empError.code, empError.message)
      setEmpresa(null)
      return // DB indisponível — não redireciona para /setup
    }
    if (emp) setEmpresa(emp as Empresa)
    else setEmpresa(null)
    setEmpresaFetched(true)
  }

  useEffect(() => {
    // failsafe: libera a tela de loading após 8s (não afeta o redirect para /setup)
    const failsafe = setTimeout(() => setLoading(false), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        try { await loadEmpresa(session.user.id) } catch { setEmpresa(null); setRole(null); setEmpresaFetched(true) }
      } else {
        setEmpresaFetched(true)
      }
      clearTimeout(failsafe)
      setLoading(false)
    }).catch(() => { clearTimeout(failsafe); setLoading(false); setEmpresaFetched(true) })

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
            setEmpresaFetched(true)
          }
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

  // Só redireciona para /setup quando loadEmpresa confirmou que não há empresa
  // (empresaFetched=true). O failsafe de loading não deve disparar o redirect.
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
