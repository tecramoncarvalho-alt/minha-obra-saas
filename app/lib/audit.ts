import { createClient } from '@supabase/supabase-js'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function createAuditLog(params: {
  actorId: string
  targetType: string
  targetId: string
  action: string
  details?: Record<string, unknown>
  empresaId?: string
}): Promise<void> {
  try {
    const admin = adminClient()
    await admin.from('audit_logs').insert({
      actor_id: params.actorId,
      target_type: params.targetType,
      target_id: params.targetId,
      action: params.action,
      details: params.details ?? {},
      empresa_id: params.empresaId ?? null,
    })
  } catch (err) {
    console.error('[audit] falha ao registrar log:', err)
  }
}
