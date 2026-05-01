import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = (searchParams.get('type') ?? 'email') as EmailOtpType
  const next       = searchParams.get('next') ?? '/'

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  let authError: Error | null = null

  if (code) {
    // Fluxo PKCE (signup via browser ou OAuth)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  } else if (token_hash) {
    // Fluxo OTP/magic-link (links de email do dashboard Supabase)
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    authError = error
  } else {
    return NextResponse.redirect(new URL('/login?error=missing_params', request.url))
  }

  if (authError) {
    console.error('[auth/callback] erro:', authError.message)
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed&detail=${encodeURIComponent(authError.message)}`, request.url)
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Usuário convidado: vincula empresa automaticamente
  if (user?.user_metadata?.empresa_id) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await admin.from('usuarios_empresas').upsert(
      {
        user_id:    user.id,
        empresa_id: user.user_metadata.empresa_id,
        role:       user.user_metadata.role ?? 'editor',
      },
      { onConflict: 'user_id,empresa_id' }
    )
    await supabase.auth.updateUser({ data: { empresa_id: null, role: null } })
  }

  return NextResponse.redirect(new URL(next, request.url))
}
