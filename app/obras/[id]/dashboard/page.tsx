'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─── Interfaces ───
interface Obra { id: number; nome: string; data_inicio: string | null; data_fim: string | null; }
interface Pavimento { id: number; obra_id: number; nome: string; numero: number | null; }
interface Subatividade {
  id: number; atividade_id: number; nome: string;
  duracao: number; equipe: string | null; efetivo: number | null; ordem: number;
}
interface Atividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  efetivo: number | null;
  subatividades: Subatividade[];
  pavimento?: Pavimento;
}
interface Versao {
  id: number; obra_id: number; nome: string; descricao: string | null;
  status: 'Definitiva' | 'Em Atualização';
  snapshot: { pavimentos: any[] };
  created_at: string;
}
interface ItemEfetivo {
  equipe: string;
  efetivo: number;
  atividades: { nome: string; pavimento: string; subNome?: string }[];
}

// ─── Helpers ───
const toStr = (d: Date) => d.toISOString().split('T')[0];
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const fmtDate = (s: string) => parseDate(s).toLocaleDateString('pt-BR');
const fmtDiaSemana = (s: string) => parseDate(s).toLocaleDateString('pt-BR', { weekday: 'long' });
const hoje = () => toStr(new Date());

const estaNoIntervalo = (data: string, inicio: string, fim: string) => {
  const d = parseDate(data), i = parseDate(inicio), f = parseDate(fim);
  return d >= i && d <= f;
};

// Cores por equipe
const CORES_EQUIPE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];
const coresEquipe: Record<string,string> = {};
let ceIdx = 0;
const getCorEquipe = (equipe: string) => {
  if (!coresEquipe[equipe]) coresEquipe[equipe] = CORES_EQUIPE[ceIdx++ % CORES_EQUIPE.length];
  return coresEquipe[equipe];
};

export default function Dashboard() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<Pavimento[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState(hoje());

  // Versões
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoSelecionada, setVersaoSelecionada] = useState<Versao | null>(null);
  const [modoVersao, setModoVersao] = useState(false); // true = visualizando snapshot

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => { fetchDados(); fetchVersoes(); }, [obraId, supabase]);

  const fetchVersoes = async () => {
    const { data } = await supabase
      .from('versoes').select('*').eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setVersoes(data as Versao[]);
      // Carregar definitiva mais recente por padrão
      const definitiva = (data as Versao[]).find(v => v.status === 'Definitiva');
      if (definitiva) {
        setVersaoSelecionada(definitiva);
        setModoVersao(true);
      }
    }
  };

  // Atividades: do banco (ao vivo) ou do snapshot da versão
  const atividadesEfetivas = useMemo((): Atividade[] => {
    if (modoVersao && versaoSelecionada) {
      // Montar atividades a partir do snapshot
      return (versaoSelecionada.snapshot.pavimentos || []).flatMap((pav: any) =>
        (pav.atividades || []).map((at: any) => ({
          ...at,
          subatividades: at.subatividades || [],
          pavimento: { id: pav.id, nome: pav.nome, numero: pav.numero, obra_id: obraId },
        }))
      );
    }
    return atividades;
  }, [modoVersao, versaoSelecionada, atividades, obraId]);

  const fetchDados = async () => {
    try {
      setLoading(true);

      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos').select('*').eq('obra_id', obraId);
      setPavimentos(pavData || []);

      const pavIds = (pavData || []).map(p => p.id);
      if (pavIds.length === 0) { setLoading(false); return; }

      // Buscar atividades — sem filtro de data (filtramos no front)
      const { data: atData, error: atError } = await supabase
        .from('atividades')
        .select('*')
        .in('pavimento_id', pavIds);

      if (atError) {
        console.error('Erro ao buscar atividades:', atError);
        setLoading(false);
        return;
      }

      console.log('Atividades encontradas:', atData?.length, atData);

      const atIds = (atData || []).map(a => a.id);

      // Buscar subatividades — tratar se tabela não existir
      let subData: Subatividade[] = [];
      if (atIds.length > 0) {
        const { data: subResult, error: subError } = await supabase
          .from('subatividades')
          .select('*')
          .in('atividade_id', atIds)
          .order('ordem');

        if (subError) {
          console.warn('Subatividades não disponíveis:', subError.message);
        } else {
          subData = subResult || [];
        }
      }

      console.log('Subatividades encontradas:', subData.length, subData);

      // Montar mapa
      const pavMap = Object.fromEntries((pavData || []).map(p => [p.id, p]));
      const subMap: Record<number, Subatividade[]> = {};
      subData.forEach(s => {
        if (!subMap[s.atividade_id]) subMap[s.atividade_id] = [];
        subMap[s.atividade_id].push(s);
      });

      const ativsCompletas: Atividade[] = (atData || []).map(a => ({
        ...a,
        equipe: a.equipe ?? null,
        efetivo: a.efetivo ?? null,
        subatividades: (subMap[a.id] || []).map(s => ({
          ...s,
          equipe: s.equipe ?? null,
          efetivo: s.efetivo ?? null,
        })),
        pavimento: pavMap[a.pavimento_id],
      }));

      console.log('Atividades completas montadas:', ativsCompletas.length);
      setAtividades(ativsCompletas);
    } catch (err) {
      console.error('Erro geral no fetchDados:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Atividades do dia selecionado ───
  const atividadesDoDia = useMemo(() => {
    return atividadesEfetivas.filter(a =>
      estaNoIntervalo(dataSelecionada, a.data_inicio, a.data_fim)
    );
  }, [atividadesEfetivas, dataSelecionada]);

  // ─── Calcular efetivo do dia ───
  const efetivoDoDia = useMemo((): ItemEfetivo[] => {
    const mapa: Record<string, ItemEfetivo> = {};

    const garantirEquipe = (chave: string) => {
      if (!mapa[chave]) mapa[chave] = { equipe: chave, efetivo: 0, atividades: [] };
    };

    atividadesDoDia.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento';

      if (at.subatividades && at.subatividades.length > 0) {
        // ── Atividade com subatividades ──
        // Agrupar subatividades por equipe para evitar duplicatas
        const subsPorEquipe: Record<string, { efetivo: number; nomes: string[] }> = {};

        at.subatividades.forEach(sub => {
          // Equipe da sub tem prioridade; fallback para equipe da atividade pai
          const equipeChave = (sub.equipe?.trim()) || (at.equipe?.trim()) || 'Sem equipe';
          if (!subsPorEquipe[equipeChave]) subsPorEquipe[equipeChave] = { efetivo: 0, nomes: [] };
          if (sub.efetivo && sub.efetivo > 0) subsPorEquipe[equipeChave].efetivo += sub.efetivo;
          subsPorEquipe[equipeChave].nomes.push(sub.nome);
        });

        Object.entries(subsPorEquipe).forEach(([equipeChave, dados]) => {
          garantirEquipe(equipeChave);
          mapa[equipeChave].efetivo += dados.efetivo;
          // Uma entrada por atividade (com subNomes concatenados)
          mapa[equipeChave].atividades.push({
            nome: at.nome,
            pavimento: nomePav,
            subNome: dados.nomes.join(', '),
          });
        });

      } else {
        // ── Atividade simples sem subatividades ──
        const equipeChave = at.equipe?.trim() || 'Sem equipe';
        garantirEquipe(equipeChave);
        // Somar efetivo da atividade pai
        if (at.efetivo && at.efetivo > 0) {
          mapa[equipeChave].efetivo += at.efetivo;
        }
        mapa[equipeChave].atividades.push({
          nome: at.nome, pavimento: nomePav,
          subNome: at.efetivo ? `${at.efetivo} func.` : undefined,
        });
      }
    });

    // Ordenar: equipes com efetivo primeiro, depois sem efetivo
    return Object.values(mapa).sort((a, b) => {
      if (b.efetivo !== a.efetivo) return b.efetivo - a.efetivo;
      return a.equipe.localeCompare(b.equipe);
    });
  }, [atividadesDoDia]);

  const totalEfetivo = efetivoDoDia.reduce((acc, e) => acc + e.efetivo, 0);

  // ─── Agrupar atividades por bloco ───
  const atividadesPorBloco = useMemo(() => {
    const grupos: Record<string, Atividade[]> = {};
    atividadesDoDia.forEach(at => {
      const bloco = at.pavimento?.nome.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : (at.pavimento?.nome || 'Sem bloco');
      if (!grupos[bloco]) grupos[bloco] = [];
      grupos[bloco].push(at);
    });
    return grupos;
  }, [atividadesDoDia]);

  // ─── Indicadores rápidos ───
  const totalAtividades = atividades.length;
  const atividadesEmAndamento = atividadesDoDia.length;
  const equipesAtivas = useMemo(() => {
    const set = new Set<string>();
    atividadesDoDia.forEach(at => {
      if (at.subatividades && at.subatividades.length > 0) {
        at.subatividades.forEach(s => {
          const eq = s.equipe?.trim() || at.equipe?.trim();
          if (eq) set.add(eq);
        });
      } else if (at.equipe?.trim()) {
        set.add(at.equipe.trim());
      }
    });
    return set.size;
  }, [atividadesDoDia]);

  const diasRestantes = useMemo(() => {
    if (!obra?.data_fim) return null;
    const fim = parseDate(obra.data_fim);
    const hoje2 = new Date();
    hoje2.setHours(0,0,0,0);
    const diff = Math.ceil((fim.getTime() - hoje2.getTime()) / 86400000);
    return diff;
  }, [obra]);

  const isHoje = dataSelecionada === hoje();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <p className="text-slate-500">Carregando dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push(`/obras/${obraId}`)}
                className="text-blue-600 hover:text-blue-700 font-semibold">
                ← Voltar
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">📊 Dashboard</h1>
                <p className="text-sm text-slate-500">{obra?.nome}</p>
              </div>
            </div>

            {/* Filtro de versão */}
              {versoes.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-slate-500 font-medium">📦 Versão:</span>
                  <select
                    value={versaoSelecionada?.id ?? 'ao-vivo'}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'ao-vivo') { setModoVersao(false); setVersaoSelecionada(null); }
                      else {
                        const v = versoes.find(v => String(v.id) === val);
                        if (v) { setVersaoSelecionada(v); setModoVersao(true); }
                      }
                    }}
                    className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer"
                  >
                    <option value="ao-vivo">🔴 Ao Vivo</option>
                    {versoes.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.status === 'Definitiva' ? '✅' : '🔄'} {v.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de data */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDataSelecionada(hoje())}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isHoje ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                📅 Hoje
              </button>
              <input
                type="date"
                value={dataSelecionada}
                onChange={e => setDataSelecionada(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 capitalize">{fmtDiaSemana(dataSelecionada)}</p>
                <p className="text-xs text-slate-500">{fmtDate(dataSelecionada)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ─── Cards de resumo ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Efetivo total */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">👷</div>
              <p className="text-sm text-slate-500 font-medium">Efetivo {isHoje ? 'Hoje' : 'no Dia'}</p>
            </div>
            <p className="text-4xl font-bold text-blue-600">{totalEfetivo}</p>
            <p className="text-xs text-slate-400 mt-1">funcionários previstos</p>
          </div>

          {/* Atividades em andamento */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">⚙️</div>
              <p className="text-sm text-slate-500 font-medium">Atividades</p>
            </div>
            <p className="text-4xl font-bold text-green-600">{atividadesEmAndamento}</p>
            <p className="text-xs text-slate-400 mt-1">em execução no dia</p>
          </div>

          {/* Equipes ativas */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">🦺</div>
              <p className="text-sm text-slate-500 font-medium">Equipes Ativas</p>
            </div>
            <p className="text-4xl font-bold text-orange-600">{equipesAtivas}</p>
            <p className="text-xs text-slate-400 mt-1">equipes no campo</p>
          </div>

          {/* Dias restantes */}
          <div className={`bg-white rounded-xl border shadow-sm p-5 ${
            diasRestantes !== null && diasRestantes < 0 ? 'border-red-200' :
            diasRestantes !== null && diasRestantes < 30 ? 'border-yellow-200' : 'border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                diasRestantes !== null && diasRestantes < 0 ? 'bg-red-100' :
                diasRestantes !== null && diasRestantes < 30 ? 'bg-yellow-100' : 'bg-purple-100'
              }`}>📆</div>
              <p className="text-sm text-slate-500 font-medium">Prazo da Obra</p>
            </div>
            {diasRestantes !== null ? (
              <>
                <p className={`text-4xl font-bold ${
                  diasRestantes < 0 ? 'text-red-600' : diasRestantes < 30 ? 'text-yellow-600' : 'text-purple-600'
                }`}>{Math.abs(diasRestantes)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {diasRestantes < 0 ? '⚠️ dias em atraso' : diasRestantes === 0 ? '🎯 termina hoje' : 'dias restantes'}
                </p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Sem prazo definido</p>
            )}
          </div>
        </div>

        {/* ─── Corpo principal ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ─── Efetivo por Equipe ─── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">👷 Efetivo por Equipe</h2>
              {totalEfetivo > 0 && (
                <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">
                  {totalEfetivo} total
                </span>
              )}
            </div>

            {efetivoDoDia.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <p className="text-4xl mb-3">😴</p>
                <p className="text-slate-500 font-medium">Nenhuma equipe prevista</p>
                <p className="text-slate-400 text-sm mt-1">
                  {isHoje ? 'Não há atividades programadas para hoje' : `Não há atividades em ${fmtDate(dataSelecionada)}`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {efetivoDoDia.map((item) => {
                  const cor = getCorEquipe(item.equipe);
                  const pct = totalEfetivo > 0 ? (item.efetivo / totalEfetivo) * 100 : 0;

                  return (
                    <div key={item.equipe} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cor }}></div>
                          <p className="font-bold text-slate-900">{item.equipe}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.efetivo > 0 && (
                            <span className="text-2xl font-bold" style={{ color: cor }}>{item.efetivo}</span>
                          )}
                          <span className="text-xs text-slate-400">
                            {item.efetivo > 0 ? 'func.' : 'sem efetivo'}
                          </span>
                        </div>
                      </div>

                      {/* Barra de proporção */}
                      {item.efetivo > 0 && (
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }}></div>
                        </div>
                      )}

                      {/* Atividades da equipe */}
                      <div className="space-y-1">
                        {item.atividades.map((at, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="text-slate-300 mt-0.5">•</span>
                            <span>
                              <span className="font-medium text-slate-700">{at.nome}</span>
                              {at.subNome && <span className="text-slate-500"> → {at.subNome}</span>}
                              <span className="text-slate-400"> · {at.pavimento}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Atividades do Dia ─── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">⚙️ Atividades do Dia</h2>
              {atividadesEmAndamento > 0 && (
                <span className="bg-green-100 text-green-700 text-sm font-bold px-3 py-1 rounded-full">
                  {atividadesEmAndamento} atividade{atividadesEmAndamento > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {atividadesDoDia.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-slate-500 font-medium">Nenhuma atividade prevista</p>
                <p className="text-slate-400 text-sm mt-1">
                  {isHoje ? 'Nada programado para hoje' : `Nada programado para ${fmtDate(dataSelecionada)}`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(atividadesPorBloco).map(([bloco, ativs]) => (
                  <div key={bloco} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Header do bloco */}
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                      <span>🏢</span>
                      <h3 className="font-bold text-slate-900 text-sm">{bloco}</h3>
                      <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                        {ativs.length} atividade{ativs.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Lista de atividades */}
                    <div className="divide-y divide-slate-100">
                      {ativs.map(at => {
                        const diasTotais = at.duracao_dias || 1;
                        const diasDecorridos = Math.floor((parseDate(dataSelecionada).getTime() - parseDate(at.data_inicio).getTime()) / 86400000) + 1;
                        const progresso = Math.min(100, Math.round((diasDecorridos / diasTotais) * 100));

                        return (
                          <div key={at.id} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-slate-900 text-sm">{at.nome}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {at.pavimento?.nome.includes(' - ')
                                    ? at.pavimento.nome.split(' - ')[1]
                                    : at.pavimento?.nome}
                                </p>
                              </div>
                              <div className="text-right ml-3">
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  {progresso}%
                                </span>
                              </div>
                            </div>

                            {/* Barra de progresso */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                              <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progresso}%` }}></div>
                            </div>

                            {/* Info */}
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>📅 {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</span>
                              <span>⏱️ {diasDecorridos}/{diasTotais}d</span>
                              {at.equipe && !at.subatividades.length && (
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(at.equipe) }}></span>
                                  {at.equipe}
                                </span>
                              )}
                            </div>

                            {/* Subatividades */}
                            {at.subatividades.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                {at.subatividades.map((sub, i) => (
                                  <div key={sub.id} className="flex items-center gap-2 bg-slate-50 rounded px-3 py-1.5 text-xs">
                                    <div className="w-2 h-2 rounded-sm flex-shrink-0"
                                      style={{ backgroundColor: CORES_EQUIPE[(i * 2) % CORES_EQUIPE.length] }}></div>
                                    <span className="font-medium text-slate-700">{sub.nome}</span>
                                    <span className="text-slate-400">{sub.duracao}d</span>
                                    {sub.equipe && (
                                      <span className="flex items-center gap-1 ml-auto">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(sub.equipe) }}></span>
                                        {sub.equipe}
                                        {sub.efetivo && <span className="font-bold text-slate-600">· {sub.efetivo} func.</span>}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Navegação rápida ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={() => router.push(`/obras/${obraId}`)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
            <p className="text-2xl mb-2">🏗️</p>
            <p className="font-bold text-slate-900">Estrutura da Obra</p>
            <p className="text-sm text-slate-500 mt-1">Gerenciar pavimentos e blocos</p>
          </button>
          <button onClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-green-300 hover:bg-green-50 transition-colors text-left">
            <p className="text-2xl mb-2">📊</p>
            <p className="font-bold text-slate-900">Linha de Balanço</p>
            <p className="text-sm text-slate-500 mt-1">Visualizar e programar atividades</p>
          </button>
          <div className="bg-white border border-slate-200 rounded-xl p-5 opacity-60">
            <p className="text-2xl mb-2">📈</p>
            <p className="font-bold text-slate-900">Relatórios</p>
            <p className="text-sm text-slate-500 mt-1">Em breve...</p>
          </div>
        </div>

      </main>
    </div>
  );
}
