'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Obra {
  id: number;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
}

interface Pavimento {
  id: number;
  obra_id: number;
  nome: string;
  numero: number | null;
}

interface Atividade {
  id: number;
  pavimento_id: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  duracao_dias: number | null;
  equipe: string | null;
}

interface PavimentoComAtividades extends Pavimento {
  atividades: Atividade[];
}

// Paleta de cores para cada atividade (por nome)
const CORES_ATIVIDADES: Record<string, string> = {};
const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16',
];
let paletteIndex = 0;

const getCorAtividade = (nome: string): string => {
  if (!CORES_ATIVIDADES[nome]) {
    CORES_ATIVIDADES[nome] = PALETTE[paletteIndex % PALETTE.length];
    paletteIndex++;
  }
  return CORES_ATIVIDADES[nome];
};

// Funções de data
const parseDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const diffDias = (start: Date, end: Date): number => {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr: string): string => {
  return parseDate(dateStr).toLocaleDateString('pt-BR');
};

const addDias = (date: Date, dias: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + dias);
  return result;
};

const toDateStr = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export default function LinhaDeBalanco() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentosComAtividades, setPavimentosComAtividades] = useState<PavimentoComAtividades[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{
    atividade: Atividade;
    pavimento: Pavimento;
    x: number;
    y: number;
  } | null>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Credenciais do Supabase não configuradas');
    return createClient(url, key);
  }, []);

  useEffect(() => {
    fetchTodosOsDados();
  }, [obraId, supabase]);

  const fetchTodosOsDados = async () => {
    try {
      setLoading(true);

      // Buscar obra
      const { data: obraData, error: obraError } = await supabase
        .from('obras')
        .select('*')
        .eq('id', obraId)
        .single();

      if (obraError || !obraData) return;
      setObra(obraData);

      // Buscar pavimentos
      const { data: pavimentosData, error: pavimentosError } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('obra_id', obraId)
        .order('numero', { ascending: false });

      if (pavimentosError || !pavimentosData) return;

      // Buscar atividades de cada pavimento
      const pavimentosCompletos: PavimentoComAtividades[] = await Promise.all(
        pavimentosData.map(async (pav) => {
          const { data: atividadesData } = await supabase
            .from('atividades')
            .select('*')
            .eq('pavimento_id', pav.id)
            .order('data_inicio', { ascending: true });

          return {
            ...pav,
            atividades: atividadesData || [],
          };
        })
      );

      setPavimentosComAtividades(pavimentosCompletos);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcular intervalo total de datas
  const { dataMinima, dataMaxima, totalDias } = useMemo(() => {
    const todasAtividades = pavimentosComAtividades.flatMap((p) => p.atividades);

    if (todasAtividades.length === 0) {
      const hoje = new Date();
      return {
        dataMinima: hoje,
        dataMaxima: addDias(hoje, 30),
        totalDias: 30,
      };
    }

    const datas = todasAtividades.flatMap((a) => [
      parseDate(a.data_inicio),
      parseDate(a.data_fim),
    ]);

    const min = new Date(Math.min(...datas.map((d) => d.getTime())));
    const max = new Date(Math.max(...datas.map((d) => d.getTime())));

    // Adicionar margem de 5 dias em cada lado
    const minComMargem = addDias(min, -5);
    const maxComMargem = addDias(max, 5);

    return {
      dataMinima: minComMargem,
      dataMaxima: maxComMargem,
      totalDias: diffDias(minComMargem, maxComMargem),
    };
  }, [pavimentosComAtividades]);

  // Gerar marcadores de tempo no eixo X
  const marcadoresTempo = useMemo(() => {
    const marcadores = [];
    const intervaloDias = totalDias <= 60 ? 7 : totalDias <= 180 ? 14 : 30;

    for (let i = 0; i <= totalDias; i += intervaloDias) {
      const data = addDias(dataMinima, i);
      marcadores.push({
        dia: i,
        label: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      });
    }
    return marcadores;
  }, [dataMinima, totalDias]);

  // Verificar conflitos (mesma equipe em pavimentos diferentes no mesmo período)
  const conflitos = useMemo(() => {
    const conflitosEncontrados: Set<number> = new Set();
    const todasAtividades = pavimentosComAtividades.flatMap((p) =>
      p.atividades.map((a) => ({ ...a, pavimentoNome: p.nome }))
    );

    for (let i = 0; i < todasAtividades.length; i++) {
      for (let j = i + 1; j < todasAtividades.length; j++) {
        const a = todasAtividades[i];
        const b = todasAtividades[j];

        if (a.equipe && b.equipe && a.equipe === b.equipe && a.pavimento_id !== b.pavimento_id) {
          const aInicio = parseDate(a.data_inicio);
          const aFim = parseDate(a.data_fim);
          const bInicio = parseDate(b.data_inicio);
          const bFim = parseDate(b.data_fim);

          // Verificar sobreposição de datas
          if (aInicio <= bFim && aFim >= bInicio) {
            conflitosEncontrados.add(a.id);
            conflitosEncontrados.add(b.id);
          }
        }
      }
    }
    return conflitosEncontrados;
  }, [pavimentosComAtividades]);

  const totalAtividades = pavimentosComAtividades.reduce(
    (acc, p) => acc + p.atividades.length, 0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600 font-medium">Carregando Linha de Balanço...</p>
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg mb-4">❌ Obra não encontrada</p>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg">← Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/obras/${obraId}`)}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                ← Voltar
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-base">📊</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Linha de Balanço</h1>
                  <p className="text-sm text-slate-500">{obra.nome}</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{pavimentosComAtividades.length}</p>
                <p className="text-xs text-slate-500">Pavimentos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{totalAtividades}</p>
                <p className="text-xs text-slate-500">Atividades</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{totalDias}</p>
                <p className="text-xs text-slate-500">Dias totais</p>
              </div>
              {conflitos.size > 0 && (
                <div className="text-center bg-red-50 border border-red-200 rounded-lg px-3 py-1">
                  <p className="text-xl font-bold text-red-600">{conflitos.size}</p>
                  <p className="text-xs text-red-500">⚠️ Conflitos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full px-6 py-6">
        {/* Legenda */}
        {totalAtividades > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-3">🎨 Legenda de Atividades</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(CORES_ATIVIDADES).map(([nome, cor]) => (
                <div key={nome} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: cor }}></div>
                  <span className="text-sm text-slate-700">{nome}</span>
                </div>
              ))}
              {conflitos.size > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
                  <div className="w-4 h-4 rounded border-2 border-red-500 bg-red-100"></div>
                  <span className="text-sm text-red-600 font-medium">⚠️ Conflito de equipe</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gráfico de Linha de Balanço */}
        {totalAtividades === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-16 text-center">
            <p className="text-slate-400 text-5xl mb-4">📊</p>
            <p className="text-slate-600 text-xl font-semibold mb-2">Nenhuma atividade cadastrada</p>
            <p className="text-slate-400 text-sm mb-6">Adicione atividades aos seus pavimentos para visualizar a Linha de Balanço</p>
            <button
              onClick={() => router.push(`/obras/${obraId}`)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Ir para a Obra
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            {/* Cabeçalho do gráfico */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-600">
                📅 Período: <strong>{dataMinima.toLocaleDateString('pt-BR')}</strong> até <strong>{dataMaxima.toLocaleDateString('pt-BR')}</strong>
                <span className="ml-4 text-slate-400">({totalDias} dias)</span>
              </p>
            </div>

            {/* Área do gráfico com scroll horizontal */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${Math.max(800, totalDias * 8)}px` }}>
                {/* Eixo X (datas) */}
                <div className="flex border-b border-slate-200 bg-slate-50">
                  {/* Coluna dos nomes dos pavimentos */}
                  <div className="w-40 min-w-40 border-r border-slate-200 px-3 py-2 flex items-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
                  </div>
                  {/* Marcadores de datas */}
                  <div className="flex-1 relative h-8">
                    {marcadoresTempo.map((m, i) => (
                      <div
                        key={i}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${(m.dia / totalDias) * 100}%` }}
                      >
                        <div className="h-2 w-px bg-slate-300"></div>
                        <span className="text-xs text-slate-500 whitespace-nowrap mt-1">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Linhas de cada pavimento */}
                {pavimentosComAtividades.map((pavimento, pavIndex) => (
                  <div
                    key={pavimento.id}
                    className={`flex border-b border-slate-100 ${pavIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    style={{ minHeight: '56px' }}
                  >
                    {/* Nome do pavimento */}
                    <div className="w-40 min-w-40 border-r border-slate-200 px-3 py-3 flex items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{pavimento.nome}</p>
                        {pavimento.numero !== null && (
                          <p className="text-xs text-slate-400">Nº {pavimento.numero}</p>
                        )}
                      </div>
                    </div>

                    {/* Área das atividades */}
                    <div className="flex-1 relative py-2">
                      {/* Linhas de grade verticais */}
                      {marcadoresTempo.map((m, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-slate-100"
                          style={{ left: `${(m.dia / totalDias) * 100}%` }}
                        ></div>
                      ))}

                      {/* Barras de atividades */}
                      {pavimento.atividades.map((atividade) => {
                        const inicio = parseDate(atividade.data_inicio);
                        const fim = parseDate(atividade.data_fim);
                        const startDia = diffDias(dataMinima, inicio);
                        const duracaoDias = diffDias(inicio, fim) + 1;

                        const leftPercent = (startDia / totalDias) * 100;
                        const widthPercent = (duracaoDias / totalDias) * 100;
                        const cor = getCorAtividade(atividade.nome);
                        const temConflito = conflitos.has(atividade.id);

                        return (
                          <div
                            key={atividade.id}
                            className="absolute top-2 bottom-2 rounded flex items-center px-2 cursor-pointer transition-opacity hover:opacity-90"
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                              backgroundColor: cor,
                              border: temConflito ? '2px solid #EF4444' : 'none',
                              minWidth: '20px',
                            }}
                            onMouseEnter={(e) => {
                              setTooltip({
                                atividade,
                                pavimento,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <span className="text-white text-xs font-semibold truncate drop-shadow">
                              {atividade.nome}
                            </span>
                            {temConflito && (
                              <span className="ml-1 text-xs">⚠️</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Alerta de conflitos */}
        {conflitos.size > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 mb-2">⚠️ Conflitos de Equipe Detectados</h3>
            <p className="text-sm text-red-700">
              A mesma equipe está alocada em dois ou mais pavimentos ao mesmo tempo.
              As atividades com borda vermelha no gráfico indicam onde ocorrem os conflitos.
              Ajuste as datas para resolver o problema.
            </p>
          </div>
        )}

        {/* Info do Projeto */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📌 Como usar este gráfico</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>🖱️ <strong>Passe o mouse</strong> sobre uma barra para ver os detalhes da atividade</li>
            <li>⚠️ <strong>Borda vermelha</strong> indica conflito de equipe (mesma equipe, datas sobrepostas)</li>
            <li>↔️ <strong>Scroll horizontal</strong> para navegar por obras longas</li>
            <li>🎨 <strong>Cores</strong> representam cada tipo de atividade</li>
          </ul>
        </div>
      </main>

      {/* Tooltip flutuante */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 pointer-events-none"
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 80,
            minWidth: '220px',
          }}
        >
          <p className="font-bold text-slate-900 text-base mb-2">{tooltip.atividade.nome}</p>
          <div className="space-y-1 text-sm text-slate-600">
            <p>🏢 <strong>Pavimento:</strong> {tooltip.pavimento.nome}</p>
            <p>📅 <strong>Início:</strong> {formatDate(tooltip.atividade.data_inicio)}</p>
            <p>📅 <strong>Fim:</strong> {formatDate(tooltip.atividade.data_fim)}</p>
            <p>⏱️ <strong>Duração:</strong> {tooltip.atividade.duracao_dias || diffDias(parseDate(tooltip.atividade.data_inicio), parseDate(tooltip.atividade.data_fim)) + 1} dias</p>
            {tooltip.atividade.equipe && (
              <p>👥 <strong>Equipe:</strong> {tooltip.atividade.equipe}</p>
            )}
            {conflitos.has(tooltip.atividade.id) && (
              <p className="text-red-600 font-semibold mt-2">⚠️ Conflito de equipe detectado!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
