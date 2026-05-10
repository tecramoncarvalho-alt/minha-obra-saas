import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/app/lib/super-admin'

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = adminClient()
  const { data: planos } = await admin.from('planos').select('*').order('max_users')

  const planosComContagem = await Promise.all(
    (planos ?? []).map(async p => {
      const { count } = await admin.from('empresas').select('*', { count: 'exact', head: true }).eq('plan_id', p.id)
      return { ...p, empresas_count: count ?? 0 }
    })
  )

  return NextResponse.json({ planos: planosComContagem })
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { nome, max_users, max_projects, storage_limit, features_enabled } = body

  if (!nome || !max_users || !max_projects || !storage_limit) {
    return NextResponse.json({ error: 'Campos obrigatórios: nome, max_users, max_projects, storage_limit.' }, { status: 400 })
  }

  const admin = adminClient()
  const { data, error } = await admin.from('planos').insert({
    nome, max_users, max_projects, storage_limit, features_enabled: features_enabled ?? [],
  }).select().single()

  if (error) return NextResponse.json({ error: 'Erro ao criar plano.' }, { status: 500 })
  return NextResponse.json({ plano: data }, { status: 201 })
}
