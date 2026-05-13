import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import TVClientWrapper from './TVClientWrapper'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function TVPublicPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // service_role exclusivamente no Server Component para resolver o token
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: obra } = await admin
    .from('obras')
    .select('id, nome')
    .eq('tv_token', token)
    .maybeSingle()

  if (!obra) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-400 gap-4">
        <div className="text-6xl">📺</div>
        <div className="text-xl font-semibold text-gray-300">Link inválido ou expirado</div>
        <div className="text-sm text-gray-500">
          Solicite um novo link ao administrador da obra.
        </div>
      </div>
    )
  }

  // Passa apenas token e nome ao client — nunca empresa_id ou tv_token
  return <TVClientWrapper token={token} obraNome={obra.nome} />
}
