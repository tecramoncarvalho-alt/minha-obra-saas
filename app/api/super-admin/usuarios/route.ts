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
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: memberships } = await admin
    .from('usuarios_empresas')
    .select('user_id, role, is_owner, created_at, empresa_id, empresas:empresa_id(nome, codigo_empresa)')
    .order('created_at', { ascending: false })

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ usuarios: [] })
  }

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map((authData?.users ?? []).map(u => [u.id, u.email ?? null]))

  const usuarios = memberships.map(m => ({
    ...m,
    email: emailMap.get(m.user_id) ?? null,
  }))

  return NextResponse.json({ usuarios })
}
