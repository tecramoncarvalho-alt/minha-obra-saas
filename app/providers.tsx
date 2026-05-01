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
    const { data } = await supabase
      .from('usuarios_empresas')
      .select('role, empresas(id, nome)')
      .eq('user_id', userId)
      .single()

    if (data?.empresas) {
      const emp = data.empresas as Empresa
      setEmpresa(emp)
      setRole(data.role as Role)
    } else {
      setEmpresa(null)
      setRole(null)
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadEmpresa(session.user.id)
        } else {
          setEmpresa(null)
          setRole(null)
        }
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
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
