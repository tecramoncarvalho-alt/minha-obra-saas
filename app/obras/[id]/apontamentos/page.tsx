'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers'
import type { ApontamentoDiario, Medicao, StatusAtividade } from '@/app/lib/types'
import { ApontamentoDiarioSchema } from '@/app/lib/schemas'
import UploadFoto from './components/UploadFoto'
import { uploadFotoComRetry } from '@/app/lib/upload-helper'
import { useStorageQuota, useApontamentosHoje } from '@/app/lib/query-hooks'

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

interface ToastItem { id: number; tipo: 'sucesso' | 'erro'; texto: string }

interface HistoricoRow {
  id: string
  data: string
  atividade_nome: string
  efetivo_real: number
  percentual_executado: number
  medicoes: Medicao[]
}

const STATUS_LABELS: Record<StatusAtividade, string> = {
  NAO_INICIADA: 'Não Iniciada',
  INICIADA: 'Iniciada',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA_NO_DIA: 'Concluída no Dia',
  PARALISADA: 'Paralisada',
}

const STATUS_CORES: Record<StatusAtividade, string> = {
  NAO_INICIADA: 'bg-gray-100 text-gray-600',
  INICIADA: 'bg-blue-100 text-blue-700',
  EM_ANDAMENTO: 'bg-yellow-100 text-yellow-700',
  CONCLUIDA_NO_DIA: 'bg-green-100 text-green-700',
  PARALISADA: 'bg-red-100 text-red-700',
}

const STATUS_DOTS: Record<StatusAtividade, string> = {
  NAO_INICIADA: 'bg-gray-400',
  INICIADA: 'bg-blue-500',
  EM_ANDAMENTO: 'bg-yellow-500',
  CONCLUIDA_NO_DIA: 'bg-green-500',
  PARALISADA: 'bg-red-500',
}

const toStr = (d: Date) => d.toISOString().slice(0, 10)
const hoje = () => toStr(new Date())

function fmtData(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
}

function fmtDataLonga() {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function corQuota(pct: number) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-green-500'
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

let toastCounter = 0

export default function ApontamentosPage() {
  const supabase = createClient()
  const { id } = useParams<{ id: string }>()
  const obraId = Number(id)
  const router = useRouter()
  const { empresa, role, loading: authLoading } = useAuth()

  const queryClient = useQueryClient()

  const [obra, setObra] = useState<Obra | null>(null)
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [atividadesAtrasadas, setAtividadesAtrasadas] = useState<Atividade[]>([])
  const [historico, setHistorico] = useState<HistoricoRow[]>([])
  const [carregando, setCarregando] = useState(true)

  // React Query: cache 5 min, invalida após salvar/upload
  const { data: apontamentosHoje = [], isSuccess: apontamentosCarregados } =
    useApontamentosHoje(obraId, hoje(), !authLoading && !!empresa)
  const { data: quota } = useStorageQuota(empresa?.id)

  const [expandidosCards, setExpandidosCards] = useState<Set<number>>(new Set())
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [expandidoFotos, setExpandidoFotos] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const [forms, setForms] = useState<Record<number, ApontamentoForm>>({})
  const [salvando, setSalvando] = useState<Record<number, boolean>>({})
  const [salvandoTodos, setSalvandoTodos] = useState(false)
  const [formsModificados, setFormsModificados] = useState<Set<number>>(new Set())
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({})

  const [arquivosPendentes, setArquivosPendentes] = useState<Record<number, File | null>>({})
  const [uploadStatus, setUploadStatus] = useState<Record<number, 'idle' | 'enviando' | 'sucesso' | 'erro'>>({})
  const [uploadProgresso, setUploadProgresso] = useState<Record<number, number>>({})
  const [uploadErroMsg, setUploadErroMsg] = useState<Record<number, string>>({})
  const [fotoUrls, setFotoUrls] = useState<Record<number, string>>({})

  const addToast = useCallback((tipo: 'sucesso' | 'erro', texto: string) => {
    const toastId = ++toastCounter
    setToasts(prev => [...prev, { id: toastId, tipo, texto }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), tipo === 'sucesso' ? 3000 : 4000)
  }, [])

  const removeToast = (toastId: number) => setToasts(prev => prev.filter(t => t.id !== toastId))

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

    // Busca todas as atividades que já começaram (sem filtro de data_fim)
    const { data: atividadesData } = await supabase
      .from('atividades')
      .select('id, nome, data_inicio, data_fim, efetivo, duracao_dias, equipe, pavimento_id')
      .in('pavimento_id', pavIds)
      .lte('data_inicio', hoje())

    const pavMap = Object.fromEntries(pavimentos.map(p => [p.id, p.nome]))
    type RawAt = { id: number; nome: string; data_inicio: string; data_fim: string; efetivo: number | null; duracao_dias: number | null; equipe: string | null; pavimento_id: number }
    const allAtivs: Atividade[] = ((atividadesData ?? []) as RawAt[]).map(a => ({
      ...a, pavimento_nome: pavMap[a.pavimento_id] ?? '',
    }))

    const ativasHoje = allAtivs.filter(a => a.data_fim >= hoje())
    const candidatasAtrasadas = allAtivs.filter(a => a.data_fim < hoje())
    setAtividades(ativasHoje)

    // Verifica atrasadas: busca último apontamento por atividade
    if (candidatasAtrasadas.length > 0) {
      const candidatasIds = candidatasAtrasadas.map(a => a.id)
      const { data: ultimos } = await supabase
        .from('apontamentos_diarios')
        .select('atividade_id, percentual_executado, status, efetivo_real, data')
        .in('atividade_id', candidatasIds)
        .order('data', { ascending: false })

      type UltimoAp = { atividade_id: number; percentual_executado: number; status: StatusAtividade; efetivo_real: number; data: string }
      const ultimoPor: Record<number, UltimoAp> = {}
      for (const ap of (ultimos ?? []) as UltimoAp[]) {
        if (!ultimoPor[ap.atividade_id]) ultimoPor[ap.atividade_id] = ap
      }

      const atrasadas = candidatasAtrasadas.filter(a => {
        const u = ultimoPor[a.id]
        if (!u) return true
        return u.percentual_executado < 100 && u.status !== 'CONCLUIDA_NO_DIA'
      })
      setAtividadesAtrasadas(atrasadas)

      setForms(prev => {
        const next = { ...prev }
        for (const at of atrasadas) {
          if (!next[at.id]) {
            const u = ultimoPor[at.id]
            next[at.id] = {
              efetivo_real: u?.efetivo_real ?? at.efetivo ?? 0,
              percentual_executado: Math.round((u?.percentual_executado ?? 0) / 5) * 5,
              observacao: '',
              status: u?.status ?? 'EM_ANDAMENTO',
            }
          }
        }
        return next
      })
    }

    // Histórico 7 dias
    const dataInicio = toStr(new Date(Date.now() - 7 * 86_400_000))
    const atividadeIds = allAtivs.map(a => a.id)
    if (atividadeIds.length > 0) {
      const { data: hist } = await supabase
        .from('apontamentos_diarios')
        .select('id,atividade_id,data,efetivo_real,percentual_executado,observacao')
        .in('atividade_id', atividadeIds)
        .gte('data', dataInicio)
        .lte('data', hoje())
        .order('data', { ascending: false })
        .limit(20)

      const { data: todasMed } = await supabase
        .from('medicoes')
        .select('id,atividade_id,apontamento_id,foto_url,data_medicao,responsavel')
        .in('atividade_id', atividadeIds)
        .gte('data_medicao', dataInicio)
        .lte('data_medicao', hoje())

      const medPor: Record<string, Medicao[]> = {}
      for (const m of (todasMed ?? []) as Medicao[]) {
        const key = `${m.atividade_id}|${m.data_medicao}`
        if (!medPor[key]) medPor[key] = []
        medPor[key].push(m)
      }

      setHistorico((hist ?? []).map((ap: ApontamentoDiario) => ({
        id: ap.id,
        data: ap.data,
        atividade_nome: allAtivs.find(a => a.id === ap.atividade_id)?.nome ?? String(ap.atividade_id),
        efetivo_real: ap.efetivo_real,
        percentual_executado: ap.percentual_executado,
        medicoes: medPor[`${ap.atividade_id}|${ap.data}`] ?? [],
      })))
    }

    setCarregando(false)
  }, [obraId, empresa])

  useEffect(() => {
    if (!authLoading && empresa) fetchDados()
  }, [authLoading, empresa, fetchDados])

  // Pré-preenche forms quando AMBOS chegam: atividades (fetchDados) + apontamentos (React Query)
  // Guarda: só preenche campos ainda não editados pelo usuário (!next[at.id])
  useEffect(() => {
    if (!atividades.length || !apontamentosCarregados) return
    const porAtividade = Object.fromEntries(apontamentosHoje.map(a => [a.atividade_id, a]))
    setForms(prev => {
      const next = { ...prev }
      for (const at of atividades) {
        if (!next[at.id]) {
          const ap = porAtividade[at.id]
          next[at.id] = {
            efetivo_real: ap?.efetivo_real ?? at.efetivo ?? 0,
            percentual_executado: Math.round((ap?.percentual_executado ?? 0) / 5) * 5,
            observacao: '',
            status: ap?.status ?? 'EM_ANDAMENTO',
          }
        }
      }
      return next
    })
  }, [apontamentosHoje, apontamentosCarregados, atividades])

  const toggleCard = (id: number) => {
    setExpandidosCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const marcarModificado = (id: number) =>
    setFormsModificados(prev => new Set([...prev, id]))

  const validarApontamento = (atividadeId: number): boolean => {
    const form = forms[atividadeId]
    if (!form) return false
    const result = ApontamentoDiarioSchema.safeParse({ atividade_id: atividadeId, data: hoje(), ...form })
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

  const salvarUm = async (atividadeId: number): Promise<boolean> => {
    if (!validarApontamento(atividadeId)) return false
    const form = forms[atividadeId]
    if (!form) return false

    const res = await fetch(`/api/obras/${obraId}/apontamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atividade_id: atividadeId, data: hoje(), ...form }),
    })

    if (!res.ok) return false
    const { apontamento } = await res.json()

    setFormsModificados(prev => { const n = new Set(prev); n.delete(atividadeId); return n })
    void queryClient.invalidateQueries({ queryKey: ['apontamentos', obraId, hoje()] })

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
        void queryClient.invalidateQueries({ queryKey: ['quota', empresa.id] })
      } catch (err) {
        setUploadStatus(prev => ({ ...prev, [atividadeId]: 'erro' }))
        setUploadErroMsg(prev => ({ ...prev, [atividadeId]: err instanceof Error ? err.message : 'Erro no upload.' }))
      }
    }
    return true
  }

  const handleSalvar = async (atividadeId: number) => {
    setSalvando(prev => ({ ...prev, [atividadeId]: true }))
    const ok = await salvarUm(atividadeId)
    addToast(ok ? 'sucesso' : 'erro', ok ? 'Apontamento salvo!' : 'Erro ao salvar apontamento.')
    setSalvando(prev => ({ ...prev, [atividadeId]: false }))
  }

  const handleSalvarTodos = async () => {
    const ids = [...formsModificados]
    if (!ids.length) return
    setSalvandoTodos(true)
    let salvos = 0, erros = 0
    for (const id of ids) {
      const ok = await salvarUm(id)
      ok ? salvos++ : erros++
    }
    void queryClient.invalidateQueries({ queryKey: ['apontamentos', obraId, hoje()] })
    if (empresa) void queryClient.invalidateQueries({ queryKey: ['quota', empresa.id] })
    setSalvandoTodos(false)
    if (salvos > 0) addToast('sucesso', `${salvos} apontamento${salvos > 1 ? 's' : ''} salvo${salvos > 1 ? 's' : ''}!`)
    if (erros > 0) addToast('erro', `${erros} apontamento${erros > 1 ? 's' : ''} com erro.`)
  }

  const handleStatusChange = (atividadeId: number, status: StatusAtividade) => {
    setForms(prev => {
      const form = prev[atividadeId]
      if (!form) return prev
      if (status === 'PARALISADA') return { ...prev, [atividadeId]: { ...form, status, efetivo_real: 0 } }
      if (status === 'CONCLUIDA_NO_DIA') return { ...prev, [atividadeId]: { ...form, status, percentual_executado: 100 } }
      return { ...prev, [atividadeId]: { ...form, status } }
    })
    marcarModificado(atividadeId)
  }

  const handlePercentualChange = (atividadeId: number, valor: number, form: ApontamentoForm) => {
    const ultimo = apontamentosHoje.find(a => a.atividade_id === atividadeId)
    if (ultimo && valor < ultimo.percentual_executado) {
      if (!window.confirm(`Avanço vai regredir de ${ultimo.percentual_executado}% para ${valor}%. Confirmar?`)) return
    }
    setForms(prev => ({ ...prev, [atividadeId]: { ...form, percentual_executado: valor } }))
    marcarModificado(atividadeId)
  }

  const temErros = (atividadeId: number) => Object.keys(errors[atividadeId] ?? {}).length > 0

  // ─── Skeleton ───────────────────────────────────────────────────────────────

  if (authLoading || carregando) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-40" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-28" />
          </div>
        </div>
        <div className="px-4 py-5 space-y-3 max-w-2xl mx-auto">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-6 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-base">Obra não encontrada.</p>
      </div>
    )
  }

  const podeEditar = role === 'admin' || role === 'planejador' || role === 'operator'

  // ─── Card de atividade ───────────────────────────────────────────────────────

  const renderCard = (at: Atividade, atrasada = false) => {
    const aberto = expandidosCards.has(at.id)
    const modificado = formsModificados.has(at.id)
    const form = forms[at.id] ?? { efetivo_real: at.efetivo ?? 0, percentual_executado: 0, observacao: '', status: 'EM_ANDAMENTO' as StatusAtividade }
    const isSalvando = salvando[at.id]
    const statusAtual = form.status
    const pctAtual = form.percentual_executado

    return (
      <div key={at.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${atrasada ? 'border-orange-200' : modificado ? 'border-blue-300' : 'border-gray-200'}`}>
        {/* Cabeçalho — sempre visível, toque abre/fecha */}
        <button
          type="button"
          onClick={() => toggleCard(at.id)}
          className={`w-full text-left px-4 py-4 flex items-start justify-between gap-3 active:bg-gray-50 ${aberto ? 'border-b border-gray-100' : ''}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900 leading-snug">{at.nome}</h3>
              {atrasada && (
                <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">
                  Atrasada
                </span>
              )}
              {modificado && (
                <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
                  Editado
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {at.pavimento_nome}{at.equipe ? ` · ${at.equipe}` : ''}
              {atrasada ? ` · Prazo: ${fmtData(at.data_fim)}` : ''}
            </p>
            <span className={`inline-flex items-center gap-1.5 mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CORES[statusAtual]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[statusAtual]}`} />
              {STATUS_LABELS[statusAtual]} · {pctAtual}%
            </span>
          </div>
          <span className={`text-gray-400 text-2xl leading-none mt-0.5 transition-transform duration-200 ${aberto ? 'rotate-90' : ''}`}>›</span>
        </button>

        {/* Formulário — visível quando aberto */}
        {aberto && (
          <div className="px-4 pb-5 pt-4 space-y-4">
            {podeEditar ? (
              <>
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status da atividade</label>
                  <select
                    value={form.status}
                    onChange={e => handleStatusChange(at.id, e.target.value as StatusAtividade)}
                    className="w-full h-11 border border-gray-300 rounded-xl px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {(Object.keys(STATUS_LABELS) as StatusAtividade[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  {form.status === 'PARALISADA' && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                      ⚠️ Efetivo zerado, progresso preservado
                    </p>
                  )}
                </div>

                {/* Efetivo + % display */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Efetivo real{errors[at.id]?.efetivo_real && <span className="text-red-500 ml-1">⚠️</span>}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={form.efetivo_real}
                      disabled={form.status === 'PARALISADA'}
                      onChange={e => { setForms(prev => ({ ...prev, [at.id]: { ...form, efetivo_real: Number(e.target.value) } })); marcarModificado(at.id) }}
                      onBlur={() => validarApontamento(at.id)}
                      className={`w-full h-11 border rounded-xl px-3 text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50 ${errors[at.id]?.efetivo_real ? 'border-red-400' : 'border-gray-300'}`}
                    />
                    {errors[at.id]?.efetivo_real && (
                      <p className="text-xs text-red-500 mt-1">{errors[at.id].efetivo_real}</p>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">% Executado</label>
                    <div className={`w-full h-11 border rounded-xl flex items-center justify-center text-xl font-bold ${form.percentual_executado >= 80 ? 'text-green-600 bg-green-50 border-green-200' : form.percentual_executado >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 'text-gray-700 border-gray-300 bg-gray-50'}`}>
                      {form.percentual_executado}%
                    </div>
                  </div>
                </div>

                {/* Slider */}
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={form.percentual_executado}
                    disabled={form.status === 'PARALISADA' || form.status === 'CONCLUIDA_NO_DIA'}
                    onChange={e => handlePercentualChange(at.id, Number(e.target.value), form)}
                    className="w-full accent-green-500 disabled:opacity-50"
                    style={{ height: '36px' }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 -mt-1">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                  {errors[at.id]?.percentual_executado && (
                    <p className="text-xs text-red-500 mt-1">{errors[at.id].percentual_executado}</p>
                  )}
                </div>

                {/* Observações */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Observações (opcional)</label>
                  <textarea
                    value={form.observacao}
                    onChange={e => { setForms(prev => ({ ...prev, [at.id]: { ...form, observacao: e.target.value } })); marcarModificado(at.id) }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    placeholder="Observações sobre o andamento..."
                  />
                </div>

                {/* Upload foto */}
                {empresa && (
                  <UploadFoto
                    onFileSelecionado={(file) => {
                      setArquivosPendentes(prev => ({ ...prev, [at.id]: file }))
                      if (file) {
                        marcarModificado(at.id)
                      } else {
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
                )}

                {/* Botão salvar individual */}
                <button
                  type="button"
                  onClick={() => handleSalvar(at.id)}
                  disabled={isSalvando || temErros(at.id)}
                  className="w-full h-12 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white text-base font-semibold rounded-xl active:bg-slate-900 transition-colors flex items-center justify-center gap-2"
                >
                  {isSalvando
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                    : '✓ Salvar este'}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">Você tem permissão somente de leitura.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 pb-32">

      {/* Toasts */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col gap-2 px-4 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium pointer-events-auto max-w-lg mx-auto w-full ${t.tipo === 'sucesso' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            <span>{t.tipo === 'sucesso' ? '✓' : '⚠️'} {t.texto}</span>
            <button type="button" onClick={() => removeToast(t.id)} className="w-8 h-8 flex items-center justify-center text-white/80 text-xl leading-none">×</button>
          </div>
        ))}
      </div>

      {/* Header padronizado */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={() => router.push(`/obras/${obraId}/dashboard`)}
                className="text-blue-600 hover:text-blue-700 font-semibold flex-shrink-0"
              >
                ← Voltar
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 truncate">{obra.nome}</h1>
                <p className="text-sm text-slate-500 capitalize">{fmtDataLonga()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => router.push(`/obras/${obraId}`)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
              >
                ⚙️ Configurar
              </button>
              <button
                type="button"
                onClick={() => router.push(`/obras/${obraId}/dashboard`)}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                📋 Dashboard
              </button>
              <button
                type="button"
                onClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                📊 Linha de Balanço
              </button>
            </div>
          </div>
        </div>

        {/* Barra de quota */}
        {quota && (
          <div className="px-6 pb-3 max-w-7xl mx-auto">
            <div className="flex items-center gap-2 max-w-sm">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${corQuota(quota.percentual_usado)}`}
                  style={{ width: `${Math.min(100, quota.percentual_usado)}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {formatBytes(quota.storage_usado_bytes)} / {formatBytes(quota.storage_limite_bytes)}
              </span>
            </div>
            {quota.percentual_usado >= 90 && (
              <p className="text-xs text-red-500 mt-1">
                {quota.percentual_usado >= 100 ? 'Armazenamento esgotado.' : 'Armazenamento quase cheio.'}
              </p>
            )}
          </div>
        )}
      </header>

      {/* Botão flutuante Salvar Tudo */}
      {podeEditar && formsModificados.size > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
          <button
            type="button"
            onClick={handleSalvarTodos}
            disabled={salvandoTodos}
            className="pointer-events-auto bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold px-8 py-4 rounded-2xl shadow-2xl text-base flex items-center gap-3 transition-all active:scale-95"
          >
            {salvandoTodos
              ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
              : <>✓ Salvar tudo ({formsModificados.size})</>
            }
          </button>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">

        {/* Seção: Hoje */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Hoje</h2>
            {atividades.length > 0 && (
              <span className="text-sm text-gray-400">{atividades.length} atividade{atividades.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {atividades.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-10 text-center">
              <p className="text-gray-500 text-base">Nenhuma atividade em execução hoje.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {atividades.map(at => renderCard(at, false))}
            </div>
          )}
        </section>

        {/* Seção: Atrasadas */}
        {atividadesAtrasadas.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-semibold text-orange-700">⚠️ Atrasadas</h2>
              <span className="text-sm text-orange-500">
                {atividadesAtrasadas.length} pendente{atividadesAtrasadas.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-3">
              {atividadesAtrasadas.map(at => renderCard(at, true))}
            </div>
          </section>
        )}

        {/* Seção: Histórico (colapsável) */}
        <section>
          <button
            type="button"
            onClick={() => setHistoricoAberto(prev => !prev)}
            className="w-full h-12 flex items-center justify-between px-4 bg-white rounded-2xl border border-gray-200 active:bg-gray-50"
          >
            <span className="text-base font-semibold text-gray-800">
              Histórico — últimos 7 dias
              {historico.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">({historico.length})</span>}
            </span>
            <span className={`text-gray-400 text-2xl leading-none transition-transform duration-200 ${historicoAberto ? 'rotate-90' : ''}`}>›</span>
          </button>

          {historicoAberto && (
            <div className="mt-2 space-y-2">
              {historico.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 px-4 py-8 text-center">
                  <p className="text-gray-500 text-base">Nenhum apontamento nos últimos 7 dias.</p>
                </div>
              ) : (
                historico.map(row => {
                  const fotosAberto = expandidoFotos[row.id]
                  const fotosValidas = row.medicoes.filter(m => m.foto_url)
                  return (
                    <Fragment key={row.id}>
                      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{row.atividade_nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{fmtData(row.data)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-base font-bold ${row.percentual_executado >= 80 ? 'text-green-600' : row.percentual_executado >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {row.percentual_executado}%
                            </p>
                            <p className="text-xs text-gray-400">{row.efetivo_real} pess.</p>
                          </div>
                          {fotosValidas.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandidoFotos(prev => ({ ...prev, [row.id]: !fotosAberto }))}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 text-sm font-medium shrink-0"
                            >
                              {fotosValidas.length}📷
                            </button>
                          )}
                        </div>
                        {fotosAberto && fotosValidas.length > 0 && (
                          <div className="px-4 pb-3 pt-2 border-t border-gray-100 flex gap-2 flex-wrap">
                            {fotosValidas.map(m => (
                              <a key={m.id} href={m.foto_url!} target="_blank" rel="noreferrer" className="relative block h-16 w-16 shrink-0">
                                <Image
                                  src={m.foto_url!}
                                  alt="Medição"
                                  fill
                                  sizes="64px"
                                  className="object-cover rounded-xl border border-gray-200"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  )
                })
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
