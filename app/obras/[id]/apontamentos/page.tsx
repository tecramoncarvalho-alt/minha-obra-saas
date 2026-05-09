'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers'
import type { ApontamentoDiario, Medicao, StorageQuota, StatusAtividade } from '@/app/lib/types'
import { ApontamentoDiarioSchema } from '@/app/lib/schemas'
import UploadFoto from './components/UploadFoto'
import { uploadFotoComRetry } from '@/app/lib/upload-helper'

interface Obra { id: number; nome: string }
interface Atividade {
  id: number
  nome: string
  data_inicio: string
  data_fim: string
  efetivo: number | null
  duracao_dias: number | null
  equipe: string | null
  pavimento_nome: string
}

interface ApontamentoForm {
  efetivo_real: number
  percentual_executado: number
  observacao: string
  status: StatusAtividade
}

const STATUS_LABELS: Record<StatusAtividade, string> = {
  NAO_INICIADA: 'Não Iniciada',
  INICIADA: 'Iniciada',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA_NO_DIA: 'Concluída no Dia',
  PARALISADA: 'Paralisada',
}

interface HistoricoRow {
  id: string
  data: string
  atividade_nome: string
  efetivo_real: number
  percentual_executado: number
  observacao?: string
  medicoes: Medicao[]
}

const toStr = (d: Date) => d.toISOString().slice(0, 10)
const hoje = () => toStr(new Date())

function fmtData(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

function tempoAtras(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const min = Math.floor(diff / 60_000)
  if (h >= 24) return `há ${Math.floor(h / 24)}d`
  if (h >= 1) return `há ${h}h`
  if (min >= 1) return `há ${min}min`
  return 'agora'
}

function corQuota(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-green-500'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function ApontamentosPage() {
  const supabase = createClient()
  const { id } = useParams<{ id: string }>()
  const obraId = Number(id)
  const router = useRouter()
  const { empresa, role, loading: authLoading } = useAuth()

  const [obra, setObra] = useState<Obra | null>(null)
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [apontamentosHoje, setApontamentosHoje] = useState<ApontamentoDiario[]>([])
  const [historico, setHistorico] = useState<HistoricoRow[]>([])
  const [quota, setQuota] = useState<StorageQuota | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [forms, setForms] = useState<Record<number, ApontamentoForm>>({})
  const [salvando, setSalvando] = useState<Record<number, boolean>>({})
  const [mensagens, setMensagens] = useState<Record<number, { tipo: 'sucesso' | 'erro'; texto: string }>>({})
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({})

  const [arquivosPendentes, setArquivosPendentes] = useState<Record<number, File | null>>({})
  const [uploadStatus, setUploadStatus] = useState<Record<number, 'idle' | 'enviando' | 'sucesso' | 'erro'>>({})
  const [uploadProgresso, setUploadProgresso] = useState<Record<number, number>>({})
  const [uploadErroMsg, setUploadErroMsg] = useState<Record<number, string>>({})
  const [fotoUrls, setFotoUrls] = useState<Record<number, string>>({})

  const fetchDados = useCallback(async () => {
    if (!empresa) return
    setCarregando(true)

    const [{ data: obraData }, { data: pavimentosRaw }] = await Promise.all([
      supabase.from('obras').select('id, nome').eq('id', obraId).single(),
      supabase.from('pavimentos').select('id, nome').eq('obra_id', obraId),
    ])

    if (!obraData || !pavimentosRaw?.length) { setCarregando(false); return }
    setObra(obraData as Obra)

    const pavimentos = pavimentosRaw as { id: number; nome: string }[]
    const pavIds = pavimentos.map(p => p.id)
    const { data: atividadesData } = await supabase
      .from('atividades')
      .select('id, nome, data_inicio, data_fim, efetivo, duracao_dias, equipe, pavimento_id')
      .in('pavimento_id', pavIds)
      .lte('data_inicio', hoje())
      .gte('data_fim', hoje())

    const pavMap = Object.fromEntries(pavimentos.map(p => [p.id, p.nome]))
    type RawAtividade = { id: number; nome: string; data_inicio: string; data_fim: string; efetivo: number | null; duracao_dias: number | null; equipe: string | null; pavimento_id: number }
    const ativs: Atividade[] = ((atividadesData ?? []) as RawAtividade[]).map(a => ({
      ...a,
      pavimento_nome: pavMap[a.pavimento_id] ?? '',
    }))
    setAtividades(ativs)

    // Apontamentos de hoje
    const resHoje = await fetch(`/api/obras/${obraId}/apontamentos?data=${hoje()}`)
    if (resHoje.ok) {
      const { apontamentos } = await resHoje.json()
      setApontamentosHoje(apontamentos)

      // Pré-preenche forms com último apontamento
      const porAtividade = Object.fromEntries(
        (apontamentos as ApontamentoDiario[]).map(a => [a.atividade_id, a])
      )
      setForms(prev => {
        const next = { ...prev }
        for (const at of ativs) {
          if (!next[at.id]) {
            const ap = porAtividade[at.id]
            const rawPct = ap?.percentual_executado ?? 0
            next[at.id] = {
              efetivo_real: ap?.efetivo_real ?? at.efetivo ?? 0,
              percentual_executado: Math.round(rawPct / 5) * 5,
              observacao: '',
              status: ap?.status ?? 'EM_ANDAMENTO',
            }
          }
        }
        return next
      })
    }

    // Histórico dos últimos 7 dias (limitado a 20 registros)
    const dataInicio = toStr(new Date(Date.now() - 7 * 86_400_000))
    const atividadeIds = ativs.map(a => a.id)
    if (atividadeIds.length > 0) {
      const { data: hist } = await supabase
        .from('apontamentos_diarios')
        .select('id,atividade_id,data,efetivo_real,percentual_executado,observacao')
        .in('atividade_id', atividadeIds)
        .gte('data', dataInicio)
        .lte('data', hoje())
        .order('data', { ascending: false })
        .limit(20)

      // Busca medições pelo atividade_id + intervalo de datas (uploads sem apontamento_id incluídos)
      const { data: todasMed } = await supabase
        .from('medicoes')
        .select('id,atividade_id,apontamento_id,foto_url,data_medicao,responsavel')
        .in('atividade_id', atividadeIds)
        .gte('data_medicao', dataInicio)
        .lte('data_medicao', hoje())

      const medPorAtividadeData: Record<string, Medicao[]> = {}
      for (const m of (todasMed ?? []) as Medicao[]) {
        const key = `${m.atividade_id}|${m.data_medicao}`
        if (!medPorAtividadeData[key]) medPorAtividadeData[key] = []
        medPorAtividadeData[key].push(m)
      }

      const rows: HistoricoRow[] = (hist ?? []).map((ap: ApontamentoDiario) => {
        const at = ativs.find(a => a.id === ap.atividade_id)
        return {
          id: ap.id,
          data: ap.data,
          atividade_nome: at?.nome ?? String(ap.atividade_id),
          efetivo_real: ap.efetivo_real,
          percentual_executado: ap.percentual_executado,
          observacao: ap.observacao,
          medicoes: medPorAtividadeData[`${ap.atividade_id}|${ap.data}`] ?? [],
        }
      })
      setHistorico(rows)
    }

    // Storage quota
    const resQuota = await fetch(`/api/empresa/${empresa.id}/storage-quota`)
    if (resQuota.ok) setQuota(await resQuota.json())

    setCarregando(false)
  }, [obraId, empresa])

  // Atualiza só a barra de quota sem recarregar a página inteira
  const fetchQuota = useCallback(async () => {
    if (!empresa) return
    const res = await fetch(`/api/empresa/${empresa.id}/storage-quota`)
    if (res.ok) setQuota(await res.json())
  }, [empresa])

  useEffect(() => {
    if (!authLoading && empresa) fetchDados()
  }, [authLoading, empresa, fetchDados])

  const handleSalvar = async (atividadeId: number) => {
    if (!validarApontamento(atividadeId)) return
    const form = forms[atividadeId]
    if (!form) return
    setSalvando(prev => ({ ...prev, [atividadeId]: true }))
    setMensagens(prev => { const n = { ...prev }; delete n[atividadeId]; return n })

    const res = await fetch(`/api/obras/${obraId}/apontamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atividade_id: atividadeId, data: hoje(), ...form }),
    })

    if (res.ok) {
      const { apontamento } = await res.json()
      setApontamentosHoje(prev => {
        const idx = prev.findIndex(a => a.atividade_id === atividadeId)
        if (idx >= 0) { const n = [...prev]; n[idx] = apontamento; return n }
        return [...prev, apontamento]
      })

      // Upload da foto pendente vinculada ao apontamento recém salvo
      const arquivo = arquivosPendentes[atividadeId]
      if (arquivo && empresa) {
        setUploadStatus(prev => ({ ...prev, [atividadeId]: 'enviando' }))
        setUploadProgresso(prev => ({ ...prev, [atividadeId]: 0 }))
        try {
          const result = await uploadFotoComRetry({
            file: arquivo,
            empresaId: empresa.id,
            atividadeId,
            apontamentoId: apontamento.id,
            onProgress: (p) => setUploadProgresso(prev => ({ ...prev, [atividadeId]: p })),
          })
          setUploadStatus(prev => ({ ...prev, [atividadeId]: 'sucesso' }))
          setFotoUrls(prev => ({ ...prev, [atividadeId]: result.foto_url }))
          setArquivosPendentes(prev => ({ ...prev, [atividadeId]: null }))
          void fetchQuota()
        } catch (err) {
          setUploadStatus(prev => ({ ...prev, [atividadeId]: 'erro' }))
          setUploadErroMsg(prev => ({ ...prev, [atividadeId]: err instanceof Error ? err.message : 'Erro no upload.' }))
        }
      }

      setMensagens(prev => ({ ...prev, [atividadeId]: { tipo: 'sucesso', texto: 'Apontamento salvo!' } }))
      setTimeout(() => {
        setMensagens(prev => {
          if (prev[atividadeId]?.tipo !== 'sucesso') return prev
          const n = { ...prev }
          delete n[atividadeId]
          return n
        })
      }, 3000)
    } else {
      const { error } = await res.json()
      setMensagens(prev => ({ ...prev, [atividadeId]: { tipo: 'erro', texto: error ?? 'Erro ao salvar.' } }))
    }
    setSalvando(prev => ({ ...prev, [atividadeId]: false }))
  }

  const ultimoApontamento = (atividadeId: number) =>
    apontamentosHoje.find(a => a.atividade_id === atividadeId)

  const handleStatusChange = (atividadeId: number, status: StatusAtividade) => {
    setForms(prev => {
      const form = prev[atividadeId]
      if (!form) return prev
      if (status === 'PARALISADA') {
        return { ...prev, [atividadeId]: { ...form, status, efetivo_real: 0 } }
      }
      if (status === 'CONCLUIDA_NO_DIA') {
        return { ...prev, [atividadeId]: { ...form, status, percentual_executado: 100 } }
      }
      return { ...prev, [atividadeId]: { ...form, status } }
    })
  }

  const handlePercentualChange = (atividadeId: number, valor: number, form: ApontamentoForm) => {
    const ultimo = ultimoApontamento(atividadeId)
    if (ultimo && valor < ultimo.percentual_executado) {
      const confirmar = window.confirm(
        `Avanço vai regredir de ${ultimo.percentual_executado}% para ${valor}%. Confirmar?`
      )
      if (!confirmar) return
    }
    setForms(prev => ({ ...prev, [atividadeId]: { ...form, percentual_executado: valor } }))
  }

  const validarApontamento = (atividadeId: number): boolean => {
    const form = forms[atividadeId]
    if (!form) return false
    const result = ApontamentoDiarioSchema.safeParse({
      atividade_id: atividadeId,
      data: hoje(),
      ...form,
    })
    if (result.success) {
      setErrors(prev => { const n = { ...prev }; delete n[atividadeId]; return n })
      return true
    }
    const erros: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const campo = String(issue.path[0] ?? 'geral')
      if (!erros[campo]) erros[campo] = issue.message
    }
    setErrors(prev => ({ ...prev, [atividadeId]: erros }))
    return false
  }

  const temErros = (atividadeId: number) => Object.keys(errors[atividadeId] ?? {}).length > 0

  if (authLoading || carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-sm">Carregando apontamentos...</div>
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-sm">Obra não encontrada.</div>
      </div>
    )
  }

  const podeEditar = role === 'admin' || role === 'editor'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header / breadcrumb */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <nav className="text-sm text-gray-500 flex items-center gap-2 mb-1">
          <button onClick={() => router.push('/')} className="hover:text-gray-700">Obras</button>
          <span>/</span>
          <Link href={`/obras/${obraId}`} className="hover:text-gray-700">{obra.nome}</Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">Apontamentos</span>
        </nav>
        <h1 className="text-xl font-semibold text-gray-900">Apontamentos Diários</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Card quota */}
        {quota && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Armazenamento</span>
              <span className="text-xs text-gray-500">
                {formatBytes(quota.storage_usado_bytes)} de {formatBytes(quota.storage_limite_bytes)}
                {' '}({quota.percentual_usado}%)
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${corQuota(quota.percentual_usado)}`}
                style={{ width: `${Math.min(100, quota.percentual_usado)}%` }}
              />
            </div>
            {quota.percentual_usado >= 90 && (
              <p className="text-xs text-red-600 mt-1">
                {quota.percentual_usado >= 100
                  ? 'Quota esgotada — novos uploads bloqueados.'
                  : 'Quota quase cheia — considere liberar espaço.'}
              </p>
            )}
          </div>
        )}

        {/* Seção Hoje */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            Hoje — {fmtData(hoje())}
          </h2>

          {atividades.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
              Nenhuma atividade em andamento hoje.
            </div>
          ) : (
            <div className="space-y-4">
              {atividades.map(at => {
                const ultimo = ultimoApontamento(at.id)
                const form = forms[at.id] ?? { efetivo_real: at.efetivo ?? 0, percentual_executado: 0, observacao: '', status: 'EM_ANDAMENTO' as StatusAtividade }
                const msg = mensagens[at.id]
                const isSalvando = salvando[at.id]

                return (
                  <div key={at.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <div>
                      <div className="font-semibold text-gray-900 text-base">{at.nome}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {at.pavimento_nome}{at.equipe ? ` · ${at.equipe}` : ''}
                      </div>
                    </div>

                    {ultimo && (
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${ultimo.percentual_executado >= 80 ? 'bg-green-500' : ultimo.percentual_executado >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} />
                        Última medição: <strong>{ultimo.percentual_executado}%</strong> · {ultimo.efetivo_real} pessoas · {tempoAtras(ultimo.updated_at)}
                      </div>
                    )}

                    {podeEditar && (
                      <div className="space-y-3">
                        {/* Seletor de Status */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Status da atividade</label>
                          <select
                            value={form.status}
                            onChange={e => handleStatusChange(at.id, e.target.value as StatusAtividade)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {(Object.keys(STATUS_LABELS) as StatusAtividade[]).map(s => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                          {form.status === 'PARALISADA' && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                              ⚠️ Atividade paralisada — efetivo zerado, progresso preservado
                            </p>
                          )}
                          {form.status === 'EM_ANDAMENTO' && (
                            <p className="text-xs text-blue-600 mt-1">
                              Avanço pode ser consolidado ao fim do turno ou nos dias úteis subsequentes
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {errors[at.id]?.efetivo_real && <span className="text-red-500 mr-1">⚠️</span>}
                              Efetivo real hoje
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={form.efetivo_real}
                              disabled={form.status === 'PARALISADA'}
                              onChange={e => setForms(prev => ({ ...prev, [at.id]: { ...form, efetivo_real: Number(e.target.value) } }))}
                              onBlur={() => validarApontamento(at.id)}
                              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50 ${errors[at.id]?.efetivo_real ? 'border-red-500' : 'border-gray-300'}`}
                            />
                            {errors[at.id]?.efetivo_real && (
                              <span className="text-xs text-red-500 mt-0.5 block">{errors[at.id].efetivo_real}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {errors[at.id]?.percentual_executado && <span className="text-red-500 mr-1">⚠️</span>}
                              % Executado — <strong>{form.percentual_executado}%</strong>
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={form.percentual_executado}
                              disabled={form.status === 'PARALISADA' || form.status === 'CONCLUIDA_NO_DIA'}
                              onChange={e => handlePercentualChange(at.id, Number(e.target.value), form)}
                              className="w-full accent-green-500 disabled:opacity-50"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                              <span>0%</span><span>50%</span><span>100%</span>
                            </div>
                            {errors[at.id]?.percentual_executado && (
                              <span className="text-xs text-red-500 block">{errors[at.id].percentual_executado}</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Observações (opcional)</label>
                          <textarea
                            rows={2}
                            value={form.observacao}
                            onChange={e => setForms(prev => ({ ...prev, [at.id]: { ...form, observacao: e.target.value } }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Observações sobre o andamento..."
                          />
                        </div>

                        {empresa && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Foto de medição (opcional)</label>
                            <UploadFoto
                              onFileSelecionado={(file) => {
                                setArquivosPendentes(prev => ({ ...prev, [at.id]: file }))
                                if (!file) {
                                  setUploadStatus(prev => ({ ...prev, [at.id]: 'idle' }))
                                  setUploadErroMsg(prev => ({ ...prev, [at.id]: '' }))
                                  setFotoUrls(prev => { const n = { ...prev }; delete n[at.id]; return n })
                                }
                              }}
                              uploadStatus={uploadStatus[at.id] ?? 'idle'}
                              uploadProgresso={uploadProgresso[at.id] ?? 0}
                              uploadErroMsg={uploadErroMsg[at.id] ?? ''}
                              fotoUrl={fotoUrls[at.id]}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleSalvar(at.id)}
                            disabled={isSalvando || temErros(at.id)}
                            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {isSalvando ? 'Salvando...' : 'Salvar apontamento'}
                          </button>
                          {msg && (
                            <span className={`text-sm font-medium ${msg.tipo === 'sucesso' ? 'text-green-600' : 'text-red-600'}`}>
                              {msg.texto}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {!podeEditar && (
                      <p className="text-xs text-gray-400 italic">Você tem permissão somente de leitura.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Seção histórico 7 dias */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Últimos 7 dias</h2>
          {historico.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
              Nenhum apontamento nos últimos 7 dias.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Atividade</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Efetivo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">%</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fotos</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historico.map((row) => {
                    const key = row.id
                    const aberto = expandido[key]
                    return (
                      <Fragment key={key}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700">{fmtData(row.data)}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{row.atividade_nome}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.efetivo_real}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-semibold ${row.percentual_executado >= 80 ? 'text-green-600' : row.percentual_executado >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {row.percentual_executado}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{row.medicoes.length}</td>
                          <td className="px-4 py-3">
                            {row.medicoes.length > 0 && (
                              <button
                                onClick={() => setExpandido(prev => ({ ...prev, [key]: !aberto }))}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {aberto ? 'Fechar' : 'Ver fotos'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {aberto && row.medicoes.length > 0 && (
                          <tr key={`${key}-fotos`} className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                {row.medicoes.filter(m => m.foto_url).map(m => (
                                  <a key={m.id} href={m.foto_url} target="_blank" rel="noreferrer" className="relative block h-16 w-16">
                                    <Image
                                      src={m.foto_url!}
                                      alt="Medição"
                                      fill
                                      className="object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                                    />
                                  </a>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
