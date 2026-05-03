import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getStorageQuota } from '@/app/lib/apontamentos'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  const { empresaId } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  // Valida que o usuário pertence à empresa
  const { data: membership } = await supabase
    .from('usuarios_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresaId)
    .single()

  if (!membership) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  try {
    const quota = await getStorageQuota(supabase, empresaId)
    return NextResponse.json(quota, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
