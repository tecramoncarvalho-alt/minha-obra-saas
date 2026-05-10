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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const admin = adminClient()
  const { error } = await admin.from('planos').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: 'Erro ao atualizar plano.' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const admin = adminClient()
  const { error } = await admin.from('planos').update({ ativo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Erro ao arquivar plano.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
