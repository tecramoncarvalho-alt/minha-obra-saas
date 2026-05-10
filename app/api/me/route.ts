import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
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
  if (!user) {
    return NextResponse.json({ empresa: null, role: null, isOwner: false, isSuperAdmin: false })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [membershipResult, superAdminResult] = await Promise.all([
    admin
      .from('usuarios_empresas')
      .select('role, empresa_id, is_owner')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('system_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const membership = membershipResult.data
  const isSuperAdmin = !!superAdminResult.data

  if (!membership?.empresa_id) {
    return NextResponse.json({ empresa: null, role: null, isOwner: false, isSuperAdmin })
  }

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, nome, codigo_empresa, cnpj, endereco, foto_logo_url, email_cadastro, email_recuperacao, subscription_status, expires_at, planos(id, nome, max_users, max_projects, storage_limit, features_enabled, ativo)')
    .eq('id', membership.empresa_id)
    .maybeSingle()

  const plano = empresa && 'planos' in empresa && empresa.planos
    ? (Array.isArray(empresa.planos) ? empresa.planos[0] : empresa.planos)
    : null

  return NextResponse.json({
    empresa: empresa ? {
      id: empresa.id,
      nome: empresa.nome,
      codigo_empresa: empresa.codigo_empresa ?? null,
      cnpj: empresa.cnpj ?? null,
      endereco: empresa.endereco ?? null,
      foto_logo_url: empresa.foto_logo_url ?? null,
      email_cadastro: empresa.email_cadastro ?? null,
      email_recuperacao: empresa.email_recuperacao ?? null,
      subscription_status: empresa.subscription_status ?? null,
      expires_at: empresa.expires_at ?? null,
      plano: plano ?? null,
    } : null,
    role: membership.role ?? null,
    isOwner: membership.is_owner ?? false,
    isSuperAdmin,
  })
}
