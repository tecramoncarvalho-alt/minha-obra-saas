import { SupabaseClient } from '@supabase/supabase-js'
import type { ApontamentoDiario, Medicao, StorageQuota } from './types'

function assertRole(userRole: string, allowed: string[]) {
  if (!allowed.includes(userRole)) {
    throw new Error(`Sem permissão. Role '${userRole}' não pode executar esta ação.`)
  }
}

function assertPercentual(v: number) {
  if (v < 0 || v > 100) throw new Error('percentual_executado deve estar entre 0 e 100.')
}

function assertEfetivo(v: number) {
  if (v < 0) throw new Error('efetivo_real não pode ser negativo.')
}

function assertDataNaoFutura(data: string) {
  const hoje = new Date().toISOString().slice(0, 10)
  if (data > hoje) throw new Error('Não é possível registrar apontamento para data futura.')
}

async function getAtividadeIdsDeObra(supabase: SupabaseClient, obraId: number): Promise<number[]> {
  const { data: pavimentos, error: epav } = await supabase
    .from('pavimentos')
    .select('id')
    .eq('obra_id', obraId)

  if (epav) throw new Error(epav.message)
  if (!pavimentos?.length) return []

  const pavIds = pavimentos.map(p => p.id)

  const { data: atividades, error: eat } = await supabase
    .from('atividades')
    .select('id')
    .in('pavimento_id', pavIds)

  if (eat) throw new Error(eat.message)
  return atividades?.map(a => a.id) ?? []
}

// ─── Getters ────────────────────────────────────────────────────────────────

export async function getApontamentosDoDia(
  supabase: SupabaseClient,
  obraId: number,
  data: string
): Promise<ApontamentoDiario[]> {
  const atividadeIds = await getAtividadeIdsDeObra(supabase, obraId)
  if (!atividadeIds.length) return []

  const { data: rows, error } = await supabase
    .from('apontamentos_diarios')
    .select('id,atividade_id,data,efetivo_real,percentual_executado,observacao,responsavel,created_at')
    .in('atividade_id', atividadeIds)
    .eq('data', data)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (rows ?? []) as ApontamentoDiario[]
}

export async function getApontamentosAtividade(
  supabase: SupabaseClient,
  atividadeId: number,
  dataInicio?: string,
  dataFim?: string
): Promise<ApontamentoDiario[]> {
  let query = supabase
    .from('apontamentos_diarios')
    .select('id,atividade_id,data,efetivo_real,percentual_executado,observacao,responsavel,created_at')
    .eq('atividade_id', atividadeId)
    .order('data', { ascending: false })

  if (dataInicio) query = query.gte('data', dataInicio)
  if (dataFim) query = query.lte('data', dataFim)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ApontamentoDiario[]
}

export async function getMedicoesDaAtividade(
  supabase: SupabaseClient,
  atividadeId: number
): Promise<Medicao[]> {
  const { data, error } = await supabase
    .from('medicoes')
    .select('id,apontamento_id,foto_url,data_medicao,responsavel')
    .eq('atividade_id', atividadeId)
    .order('data_medicao', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Medicao[]
}

export async function getUltimoApontamento(
  supabase: SupabaseClient,
  atividadeId: number
): Promise<ApontamentoDiario | null> {
  const { data, error } = await supabase
    .from('apontamentos_diarios')
    .select('id,atividade_id,data,efetivo_real,percentual_executado,observacao,responsavel,created_at')
    .eq('atividade_id', atividadeId)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ApontamentoDiario | null
}

// ─── Setters ────────────────────────────────────────────────────────────────

export async function salvarApontamento(
  supabase: SupabaseClient,
  apontamento: Omit<ApontamentoDiario, 'id' | 'created_at' | 'updated_at'>,
  userRole: string
): Promise<ApontamentoDiario> {
  assertRole(userRole, ['admin', 'editor'])
  assertPercentual(apontamento.percentual_executado)
  assertEfetivo(apontamento.efetivo_real)
  assertDataNaoFutura(apontamento.data)

  const { data, error } = await supabase
    .from('apontamentos_diarios')
    .upsert(apontamento, { onConflict: 'atividade_id,data' })
    .select()
    .single()

  if (error) {
    await _logUpload(supabase, { arquivo_nome: 'apontamento', status: 'falha', erro_mensagem: error.message })
    throw new Error(error.message)
  }

  await _logUpload(supabase, { arquivo_nome: 'apontamento', status: 'sucesso' })
  return data as ApontamentoDiario
}

export async function atualizarApontamento(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<ApontamentoDiario>,
  userRole: string
): Promise<ApontamentoDiario> {
  assertRole(userRole, ['admin', 'editor'])
  if (updates.percentual_executado !== undefined) assertPercentual(updates.percentual_executado)
  if (updates.efetivo_real !== undefined) assertEfetivo(updates.efetivo_real)
  if (updates.data) assertDataNaoFutura(updates.data)

  const { data, error } = await supabase
    .from('apontamentos_diarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    await _logUpload(supabase, { arquivo_nome: 'apontamento', status: 'falha', erro_mensagem: error.message })
    throw new Error(error.message)
  }

  await _logUpload(supabase, { arquivo_nome: 'apontamento', status: 'sucesso' })
  return data as ApontamentoDiario
}

export async function deletarApontamento(
  supabase: SupabaseClient,
  id: string,
  userRole: string
): Promise<void> {
  assertRole(userRole, ['admin'])

  const { error } = await supabase
    .from('apontamentos_diarios')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// ─── Storage/Quota ───────────────────────────────────────────────────────────

const QUOTA_DEFAULT_BYTES = 1 * 1024 * 1024 * 1024 // 1 GB (plano free)

export async function getStorageQuota(
  supabase: SupabaseClient,
  empresaId: string
): Promise<StorageQuota> {
  const { data, error } = await supabase
    .from('storage_quotas')
    .select('id,empresa_id,storage_usado_bytes,storage_limite_bytes,plano,created_at,updated_at')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)

  if (!data) {
    // Empresa ainda sem linha de quota — retorna default sem bloquear o upload
    return {
      id: '',
      empresa_id: empresaId,
      storage_usado_bytes: 0,
      storage_limite_bytes: QUOTA_DEFAULT_BYTES,
      plano: 'free',
      percentual_usado: 0,
      created_at: '',
      updated_at: '',
    }
  }

  const quota = data as StorageQuota
  quota.percentual_usado = Math.round((quota.storage_usado_bytes / quota.storage_limite_bytes) * 100)
  return quota
}

export async function verificarQuotaDisponivel(
  supabase: SupabaseClient,
  empresaId: string,
  bytesNecessarios: number
): Promise<boolean> {
  const quota = await getStorageQuota(supabase, empresaId)
  return quota.storage_usado_bytes + bytesNecessarios <= quota.storage_limite_bytes
}

export async function atualizarStorageUsado(
  supabase: SupabaseClient,
  empresaId: string,
  bytesDelta: number
): Promise<void> {
  const { error } = await supabase.rpc('incrementar_storage', {
    p_empresa_id: empresaId,
    p_bytes: bytesDelta,
  })

  if (error) {
    // Fallback: update manual se a rpc não existir
    const quota = await getStorageQuota(supabase, empresaId)
    const novoValor = Math.max(0, quota.storage_usado_bytes + bytesDelta)
    const { error: e2 } = await supabase
      .from('storage_quotas')
      .update({ storage_usado_bytes: novoValor })
      .eq('empresa_id', empresaId)
    if (e2) throw new Error(e2.message)
  }
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function _logUpload(
  supabase: SupabaseClient,
  entry: { arquivo_nome: string; status: 'sucesso' | 'falha'; erro_mensagem?: string }
) {
  await supabase.from('logs_upload').insert({
    arquivo_nome: entry.arquivo_nome,
    arquivo_tamanho: 0,
    bucket: 'apontamentos',
    status: entry.status,
    erro_mensagem: entry.erro_mensagem ?? null,
  })
}
