import type { Plano } from '@/app/lib/types'

export function dentroDoLimite(
  plano: Plano | null,
  campo: 'obras' | 'membros',
  atual: number
): boolean {
  if (!plano) return true
  const limite = campo === 'obras' ? plano.max_projects : plano.max_users
  return atual < limite
}

export function podeOperarComStatus(subscriptionStatus: string | null): boolean {
  return subscriptionStatus === 'Active' || subscriptionStatus === 'Trial'
}
