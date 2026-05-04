'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ConfigCalendario } from '@/app/calendario';
import { useDashboardData } from './hooks/useDashboardData';
import { useKPIs } from './hooks/useKPIs';
import { useEfetivo } from './hooks/useEfetivo';
import { SectionAlertas } from './sections/SectionAlertas';
import { SectionKPIs } from './sections/SectionKPIs';
import { SectionCurvaS } from './sections/SectionCurvaS';
import { SectionEfetivo } from './sections/SectionEfetivo';
import { SectionAtencao } from './sections/SectionAtencao';
import { ModalRelatorio } from './components/ModalRelatorio';
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

  const { atividadesDoDia, efetivoPorEquipe, equipesAtivas, avancoRealHoje, efetivoRealHoje, atividadesSemApontamento } =
    useEfetivo(atividadesEfetivas, apontamentosHoje, dataSelecionada);

  const { resumo, desvios, paralisadas, historicoPorAtividade, itensAtencao, dadosCurvaS } =
    useKPIs(atividadesEfetivas, atividadesDoDia, todosApontamentos, config, dataSelecionada, obra);

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

  const [modalRelatorio, setModalRelatorio] = useState(false);

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
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 capitalize">{fmtDiaSemana(dataSelecionada)}</p>
                <p className="text-xs text-slate-500">{fmtDate(dataSelecionada)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <SectionAlertas paralisadas={paralisadas} />

        <SectionKPIs
          resumo={resumo}
          efetivoPorEquipe={efetivoPorEquipe}
          atividadesEmAndamento={atividadesDoDia.length}
          equipesAtivas={equipesAtivas}
          diasRestantes={diasRestantes}
          obra={obra!}
          isHoje={isHoje}
          avancoRealHoje={avancoRealHoje}
          efetivoRealHoje={efetivoRealHoje}
          atividadesSemApontamento={atividadesSemApontamento}
          obraId={obraId}
          onApontamentosClick={() => router.push(`/obras/${obraId}/apontamentos`)}
        />

        <SectionCurvaS dados={dadosCurvaS} />

        <SectionEfetivo
          efetivoPorEquipe={efetivoPorEquipe}
          atividadesDoDia={atividadesDoDia}
          apontamentosHoje={apontamentosHoje}
          desvios={desvios}
          dataSelecionada={dataSelecionada}
          isHoje={isHoje}
        />

        <SectionAtencao
          itens={itensAtencao}
          historicoPorAtividade={historicoPorAtividade}
          hoje={dataSelecionada}
        />

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
          <button onClick={() => setModalRelatorio(true)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left">
            <p className="text-2xl mb-2">📈</p>
            <p className="font-bold text-slate-900">Relatórios</p>
            <p className="text-sm text-slate-500 mt-1">Exportar por dia, semana ou mês</p>
          </button>
        </div>
      </main>

      <ModalRelatorio
        aberto={modalRelatorio}
        onFechar={() => setModalRelatorio(false)}
        obra={obra!}
        atividades={atividadesEfetivas}
        apontamentosHoje={apontamentosHoje}
        feriados={feriados}
        versaoSelecionada={versaoSelecionada}
        modoVersao={modoVersao}
        dataSelecionada={dataSelecionada}
        setDataSelecionada={setDataSelecionada}
      />
    </div>
  );
}
