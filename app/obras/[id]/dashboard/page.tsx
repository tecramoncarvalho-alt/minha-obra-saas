'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ConfigCalendario } from '@/app/calendario';
import { useDashboardData } from './hooks/useDashboardData';
import { useKPIs } from './hooks/useKPIs';
import { useEfetivo } from './hooks/useEfetivo';
import { useRealTimeApontamentos } from './hooks/useRealTimeApontamentos';
import { useKPIsTemporais } from './hooks/useKPIsTemporais';
import { TabNavDashboard } from './components/TabNavDashboard';
import { TabHome } from './tabs/TabHome';
import { TabPlanejamento } from './tabs/TabPlanejamento';
import { TabRealTime } from './tabs/TabRealTime';
import { TabRelatorios } from './tabs/TabRelatorios';
import type { TabId } from './tabs/types';
import { hoje, fmtDate, fmtDiaSemana, parseDate } from './utils';

export default function Dashboard() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const {
    obra, pavimentos, atividadesEfetivas, feriados,
    versoes, versaoSelecionada, setVersaoSelecionada,
    modoVersao, setModoVersao,
    dataSelecionada, setDataSelecionada,
    apontamentosHoje, todosApontamentos,
    loading,
  } = useDashboardData(obraId);

  const config = useMemo((): ConfigCalendario => ({
    sabadoUtil: obra?.sabado_util ?? false,
    domingoUtil: obra?.domingo_util ?? false,
    feriados: feriados.map(f => f.data),
  }), [obra, feriados]);

  // ─── Abas + lazy loading ───
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [tabsCarregadas, setTabsCarregadas] = useState<Set<TabId>>(() => new Set<TabId>(['home']));

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setTabsCarregadas(prev => {
      if (prev.has(tab)) return prev;
      return new Set([...prev, tab]);
    });
  }, []);

  const kpisEnabled      = tabsCarregadas.has('home') || tabsCarregadas.has('planejamento');
  const efetivoEnabled   = tabsCarregadas.has('planejamento');
  const realtimeEnabled  = tabsCarregadas.has('realtime');
  const temporaisEnabled = tabsCarregadas.has('home');

  // ─── Hooks (sempre chamados — enabled gatea os useMemo internos) ───
  const { atividadesDoDia, efetivoPorEquipe, equipesAtivas, avancoRealHoje, efetivoRealHoje, atividadesSemApontamento } =
    useEfetivo(atividadesEfetivas, apontamentosHoje, dataSelecionada, efetivoEnabled);

  const { resumo, desvios, paralisadas, historicoPorAtividade, itensAtencao, dadosCurvaS } =
    useKPIs(atividadesEfetivas, atividadesDoDia, todosApontamentos, config, dataSelecionada, obra, kpisEnabled);

  const realTime = useRealTimeApontamentos({ obraId, enabled: realtimeEnabled });
  const kpisTemporais = useKPIsTemporais({ todosApontamentos, dataSelecionada, enabled: temporaisEnabled });

  const isHoje = dataSelecionada === hoje();

  const diasRestantes = useMemo(() => {
    if (!obra?.data_fim) return null;
    const fim = parseDate(obra.data_fim);
    const agora = new Date(); agora.setHours(0, 0, 0, 0);
    return Math.ceil((fim.getTime() - agora.getTime()) / 86400000);
  }, [obra]);

  useEffect(() => {
    router.prefetch(`/obras/${obraId}/linha-balanco`);
    router.prefetch(`/obras/${obraId}/apontamentos`);
  }, [obraId, router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-slate-500">Carregando dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ─── Header ─── */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 md:px-6 py-4">
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
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-900 capitalize">{fmtDiaSemana(dataSelecionada)}</p>
                <p className="text-xs text-slate-500">{fmtDate(dataSelecionada)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Body: sidebar + conteúdo da aba ─── */}
      <div className="flex min-h-[calc(100vh-73px)]">
        <TabNavDashboard activeTab={activeTab} onTabChange={handleTabChange} />

        <main className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-24 md:pb-6">
          {activeTab === 'home' && (
            <TabHome
              resumo={resumo}
              paralisadas={paralisadas}
              dadosCurvaS={dadosCurvaS}
              kpisTemporais={kpisTemporais}
              obra={obra}
              diasRestantes={diasRestantes}
              obraId={obraId}
              onLinhaBalancoClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
              onApontamentosClick={() => router.push(`/obras/${obraId}/apontamentos`)}
            />
          )}
          {activeTab === 'planejamento' && (
            <TabPlanejamento
              resumo={resumo}
              efetivoPorEquipe={efetivoPorEquipe}
              atividadesDoDia={atividadesDoDia}
              equipesAtivas={equipesAtivas}
              avancoRealHoje={avancoRealHoje}
              efetivoRealHoje={efetivoRealHoje}
              atividadesSemApontamento={atividadesSemApontamento}
              desvios={desvios}
              itensAtencao={itensAtencao}
              historicoPorAtividade={historicoPorAtividade}
              apontamentosHoje={apontamentosHoje}
              dataSelecionada={dataSelecionada}
              isHoje={isHoje}
              diasRestantes={diasRestantes}
              obra={obra}
              obraId={obraId}
              onApontamentosClick={() => router.push(`/obras/${obraId}/apontamentos`)}
            />
          )}
          {activeTab === 'realtime' && (
            <TabRealTime
              apontamentos={realTime.apontamentos}
              atividadesEfetivas={atividadesEfetivas}
              loading={realTime.loading}
              erro={realTime.erro}
              ultimaAtualizacao={realTime.ultimaAtualizacao}
              onRefetch={realTime.refetch}
            />
          )}
          {activeTab === 'relatorios' && (
            <TabRelatorios
              obra={obra!}
              atividades={atividadesEfetivas}
              pavimentos={pavimentos}
              versaoSelecionada={versaoSelecionada}
              modoVersao={modoVersao}
              dataSelecionada={dataSelecionada}
              setDataSelecionada={setDataSelecionada}
            />
          )}
        </main>
      </div>
    </div>
  );
}
