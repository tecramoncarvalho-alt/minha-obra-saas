import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/app/lib/super-admin'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: empresas } = await admin
    .from('empresas')
    .select('id, nome, codigo_empresa, subscription_status, expires_at, created_at, planos(nome)')
    .order('created_at', { ascending: false })

  const empresasComContagem = await Promise.all(
    (empresas ?? []).map(async e => {
      const [obras, membros] = await Promise.all([
        admin.from('obras').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id),
        admin.from('usuarios_empresas').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id),
      ])
      return { ...e, obras_count: obras.count ?? 0, membros_count: membros.count ?? 0 }
    })
  )

  return NextResponse.json({ empresas: empresasComContagem })
}
