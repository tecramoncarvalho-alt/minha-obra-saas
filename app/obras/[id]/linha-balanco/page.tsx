'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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

// Paleta de cores para cada atividade
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

interface DragState {
  atividade: Atividade;
  pavimento: Pavimento;
  startX: number;
  startDia: number;
}

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
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

      const { data: obraData, error: obraError } = await supabase
        .from('obras')
        .select('*')
        .eq('id', obraId)
        .single();

      if (obraError || !obraData) return;
      setObra(obraData);

      const { data: pavimentosData, error: pavimentosError } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('obra_id', obraId)
        .order('numero', { ascending: false });

      if (pavimentosError || !pavimentosData) return;

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

    const minComMargem = addDias(min, -5);
    const maxComMargem = addDias(max, 5);

    return {
      dataMinima: minComMargem,
      dataMaxima: maxComMargem,
      totalDias: diffDias(minComMargem, maxComMargem),
    };
  }, [pavimentosComAtividades]);

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

          if (aInicio <= bFim && aFim >= bInicio) {
            conflitosEncontrados.add(a.id);
            conflitosEncontrados.add(b.id);
          }
        }
      }
    }
    return conflitosEncontrados;
  }, [pavimentosComAtividades]);

  // Handler de início de drag
  const handleMouseDown = (e: React.MouseEvent, atividade: Atividade, pavimento: Pavimento) => {
    if (atualizando) return;
    
    e.preventDefault();
    const startX = e.clientX;
    const startDia = diffDias(dataMinima, parseDate(atividade.data_inicio));

    setDragState({
      atividade,
      pavimento,
      startX,
      startDia,
    });
  };

  // Handler de movimento do mouse
  useEffect(() => {
    if (!dragState || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.startX;
      const pixelsPorDia = containerRef.current
        ? (containerRef.current.offsetWidth - 160) / totalDias
        : 10;
      const deltasDias = Math.round(deltaX / pixelsPorDia);
      const novoDia = Math.max(0, dragState.startDia + deltasDias);

      // Mostrar preview
      if (dragState) {
        const novaData = addDias(dataMinima, novoDia);
        const duracao = diffDias(
          parseDate(dragState.atividade.data_inicio),
          parseDate(dragState.atividade.data_fim)
        );
        const dataFim = addDias(novaData, duracao);

        setTooltip({
          atividade: {
            ...dragState.atividade,
            data_inicio: toDateStr(novaData),
            data_fim: toDateStr(dataFim),
          },
          pavimento: dragState.pavimento,
          x: e.clientX,
          y: e.clientY,
        });
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.startX;
      const pixelsPorDia = containerRef.current
        ? (containerRef.current.offsetWidth - 160) / totalDias
        : 10;
      const deltasDias = Math.round(deltaX / pixelsPorDia);

      if (Math.abs(deltasDias) < 1) {
        setDragState(null);
        setTooltip(null);
        return; // Sem movimento significativo
      }

      // Atualizar no banco de dados
      setAtualizando(true);
      try {
        const novaDataInicio = addDias(parseDate(dragState.atividade.data_inicio), deltasDias);
        const duracao = diffDias(
          parseDate(dragState.atividade.data_inicio),
          parseDate(dragState.atividade.data_fim)
        );
        const novaDataFim = addDias(novaDataInicio, duracao);

        const { error } = await supabase
          .from('atividades')
          .update({
            data_inicio: toDateStr(novaDataInicio),
            data_fim: toDateStr(novaDataFim),
          })
          .eq('id', dragState.atividade.id);

        if (error) {
          setMensagem({
            tipo: 'error',
            texto: '❌ Erro ao atualizar atividade',
          });
        } else {
          setMensagem({
            tipo: 'success',
            texto: `✅ ${dragState.atividade.nome} movida para ${novaDataInicio.toLocaleDateString('pt-BR')}`,
          });
          await fetchTodosOsDados();
        }
      } catch (error) {
        setMensagem({
          tipo: 'error',
          texto: '❌ Erro ao atualizar',
        });
      } finally {
        setAtualizando(false);
        setDragState(null);
        setTooltip(null);

        // Limpar mensagem após 3 segundos
        setTimeout(() => setMensagem(null), 3000);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, dataMinima, totalDias, supabase]);

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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full px-6 py-6">
        {/* Mensagem de feedback */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              mensagem.tipo === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {mensagem.texto}
          </div>
        )}

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
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" ref={containerRef}>
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
                  <div className="w-40 min-w-40 border-r border-slate-200 px-3 py-2 flex items-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
                  </div>
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
                            className={`absolute top-2 bottom-2 rounded flex items-center px-2 cursor-grab active:cursor-grabbing transition-all ${
                              atualizando ? 'opacity-50' : 'hover:opacity-90'
                            }`}
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                              backgroundColor: cor,
                              border: temConflito ? '2px solid #EF4444' : 'none',
                              minWidth: '20px',
                              userSelect: 'none',
                            }}
                            onMouseDown={(e) => handleMouseDown(e, atividade, pavimento)}
                            onMouseEnter={(e) => {
                              if (!dragState) {
                                setTooltip({
                                  atividade,
                                  pavimento,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              if (!dragState) {
                                setTooltip(null);
                              }
                            }}
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

        {/* Info do Projeto */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📌 Como usar este gráfico</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>🖱️ <strong>Clique e arraste</strong> uma barra para reprogramar a atividade</li>
            <li>📅 <strong>A duração permanece</strong> a mesma, apenas muda a data de início</li>
            <li>✅ <strong>Salva automaticamente</strong> no banco de dados</li>
            <li>⚠️ <strong>Borda vermelha</strong> indica conflito de equipe</li>
            <li>↔️ <strong>Scroll horizontal</strong> para navegar por obras longas</li>
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
            minWidth: '240px',
          }}
        >
          <p className="font-bold text-slate-900 text-base mb-2">{tooltip.atividade.nome}</p>
          <div className="space-y-1 text-sm text-slate-600">
            <p>🏢 <strong>Pavimento:</strong> {tooltip.pavimento.nome}</p>
            <p>📅 <strong>Início:</strong> {formatDate(tooltip.atividade.data_inicio)}</p>
            <p>📅 <strong>Fim:</strong> {formatDate(tooltip.atividade.data_fim)}</p>
            <p>⏱️ <strong>Duração:</strong> {diffDias(parseDate(tooltip.atividade.data_inicio), parseDate(tooltip.atividade.data_fim)) + 1} dias</p>
            {tooltip.atividade.equipe && (
              <p>👥 <strong>Equipe:</strong> {tooltip.atividade.equipe}</p>
            )}
          </div>
          {dragState && (
            <p className="text-blue-600 font-semibold mt-2 text-xs">🔄 Arrastando...</p>
          )}
        </div>
      )}

      {/* Overlay de carregamento */}
      {atualizando && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-slate-600 font-medium">Atualizando...</p>
          </div>
        </div>
      )}
    </div>
  );
}
