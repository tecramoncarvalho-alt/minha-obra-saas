'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─── Interfaces ───
interface Obra { id: number; nome: string; }
interface Pavimento {
  id: number; obra_id: number; nome: string;
  numero: number | null; observacao: string | null;
}
interface Atividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  linha_index: number; // qual linha dentro do pavimento (0-based)
}
interface PavComAtiv extends Pavimento {
  atividades: Atividade[];
  numLinhas: number; // quantidade de linhas deste bloco
}

// ─── Meta helpers ───
const PREFIXO_META = '__BLOCO__';
const parseMeta = (obs: string | null) => {
  if (!obs?.startsWith(PREFIXO_META)) return { tipo: '', observacao: '', linhas: 1 };
  const raw = obs.replace(PREFIXO_META, '');
  const p = raw.split('||');
  const get = (k: string) => p.find(x => x.startsWith(k + '='))?.replace(k + '=', '') || '';
  return {
    tipo: get('tipo'),
    observacao: get('obs'),
    linhas: Math.max(1, Math.min(5, parseInt(get('linhas')) || 1)),
  };
};

const buildMeta = (tipo: string, obs: string, linhas: number) =>
  `${PREFIXO_META}tipo=${tipo}||obs=${obs}||linhas=${linhas}`;

// ─── Ordenação de blocos ───
const agruparPorBloco = (pavimentos: Pavimento[]) => {
  const grupos: Record<string, Pavimento[]> = {};
  pavimentos.forEach(p => {
    const bloco = p.nome.includes(' - ') ? p.nome.split(' - ')[0].trim() : 'Sem Bloco';
    if (!grupos[bloco]) grupos[bloco] = [];
    grupos[bloco].push(p);
  });
  return grupos;
};

const ordenarBlocos = (grupos: Record<string, Pavimento[]>): Array<[string, Pavimento[]]> => {
  return Object.keys(grupos)
    .sort((a, b) => {
      const aT = a.toLowerCase().includes('torre') || a.toLowerCase().includes('bloco');
      const bT = b.toLowerCase().includes('torre') || b.toLowerCase().includes('bloco');
      if (aT && !bT) return -1;
      if (!aT && bT) return 1;
      return a.localeCompare(b);
    })
    .map(k => [k, grupos[k].sort((a, b) => (b.numero ?? -Infinity) - (a.numero ?? -Infinity))]);
};

// ─── Cores ───
const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];
const coresCache: Record<string, string> = {};
let palIdx = 0;
const getCor = (nome: string) => {
  if (!coresCache[nome]) coresCache[nome] = PALETTE[palIdx++ % PALETTE.length];
  return coresCache[nome];
};

// ─── Datas ───
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const diffDias = (a: Date, b: Date) => Math.round((b.getTime()-a.getTime())/(86400000));
const addDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const toStr = (d: Date) => d.toISOString().split('T')[0];
const fmtDate = (s: string) => parseDate(s).toLocaleDateString('pt-BR');

// ─── Constantes de layout ───
const ALTURA_LINHA = 40; // px por linha de atividade
const LARGURA_NOME = 168; // px da coluna de nomes

export default function LinhaDeBalanco() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<PavComAtiv[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [mensagem, setMensagem] = useState<{tipo:'success'|'error';texto:string}|null>(null);

  // Tooltip
  const [tooltip, setTooltip] = useState<{at:Atividade;pav:PavComAtiv;x:number;y:number}|null>(null);

  // Drag
  const [drag, setDrag] = useState<{
    at: Atividade; pav: PavComAtiv;
    startX: number; startDia: number;
    startY: number; startLinha: number;
    deltaDias: number; deltaLinha: number;
  } | null>(null);

  // Editar linhas do bloco (hover no nome do pavimento)
  const [editandoBloco, setEditandoBloco] = useState<{blocoNome:string;linhasAtuais:number}|null>(null);
  const [salvandoLinhas, setSalvandoLinhas] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  useEffect(() => { fetchDados(); }, [obraId, supabase]);

  const fetchDados = async () => {
    try {
      setLoading(true);
      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });

      if (!pavData) return;

      // Ordenar por blocos
      const grupos = agruparPorBloco(pavData);
      const ordenados = ordenarBlocos(grupos).flatMap(([_, pavs]) => pavs);

      // Para cada bloco, ler numLinhas do 1º pavimento
      const numLinhasPorBloco: Record<string, number> = {};
      Object.entries(grupos).forEach(([blocoNome, pavs]) => {
        const primeiro = pavs.find(p => p.observacao?.startsWith(PREFIXO_META));
        numLinhasPorBloco[blocoNome] = primeiro ? parseMeta(primeiro.observacao).linhas : 1;
      });

      // Buscar atividades com linha_index
      const pavCompletos: PavComAtiv[] = await Promise.all(
        ordenados.map(async (pav) => {
          const blocoNome = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : 'Sem Bloco';
          const { data: ativData } = await supabase
            .from('atividades').select('*')
            .eq('pavimento_id', pav.id).order('data_inicio');
          const atividades = (ativData || []).map(a => ({
            ...a,
            linha_index: a.linha_index ?? 0,
          }));
          return { ...pav, atividades, numLinhas: numLinhasPorBloco[blocoNome] ?? 1 };
        })
      );

      setPavimentos(pavCompletos);
    } finally { setLoading(false); }
  };

  // ─── Datas mín/máx ───
  const { dataMin, totalDias } = useMemo(() => {
    const todas = pavimentos.flatMap(p => p.atividades);
    if (todas.length === 0) {
      const hoje = new Date();
      return { dataMin: addDias(hoje, -5), totalDias: 40 };
    }
    const datas = todas.flatMap(a => [parseDate(a.data_inicio), parseDate(a.data_fim)]);
    const min = addDias(new Date(Math.min(...datas.map(d => d.getTime()))), -5);
    const max = addDias(new Date(Math.max(...datas.map(d => d.getTime()))), 5);
    return { dataMin: min, totalDias: Math.max(30, diffDias(min, max)) };
  }, [pavimentos]);

  const marcadores = useMemo(() => {
    const step = totalDias <= 60 ? 7 : totalDias <= 180 ? 14 : 30;
    return Array.from({ length: Math.floor(totalDias / step) + 1 }, (_, i) => ({
      dia: i * step,
      label: addDias(dataMin, i * step).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    }));
  }, [dataMin, totalDias]);

  const pixelsPorDia = useCallback(() => {
    if (!containerRef.current) return 10;
    return (containerRef.current.offsetWidth - LARGURA_NOME) / totalDias;
  }, [totalDias]);

  // ─── Drag ───
  const handleMouseDown = (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
    e.preventDefault();
    setDrag({
      at, pav,
      startX: e.clientX, startDia: diffDias(dataMin, parseDate(at.data_inicio)),
      startY: e.clientY, startLinha: at.linha_index,
      deltaDias: 0, deltaLinha: 0,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const ppd = pixelsPorDia();
      const deltaDias = Math.round((e.clientX - drag.startX) / ppd);
      const deltaLinhaRaw = Math.round((e.clientY - drag.startY) / ALTURA_LINHA);
      const novaLinha = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + deltaLinhaRaw));
      const deltaLinha = novaLinha - drag.startLinha;

      setDrag(prev => prev ? { ...prev, deltaDias, deltaLinha } : null);

      // Atualizar tooltip com datas preview
      const novoInicio = addDias(parseDate(drag.at.data_inicio), deltaDias);
      const dur = diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim));
      setTooltip({
        at: { ...drag.at, data_inicio: toStr(novoInicio), data_fim: toStr(addDias(novoInicio, dur)), linha_index: drag.startLinha + deltaLinha },
        pav: drag.pav, x: e.clientX, y: e.clientY,
      });
    };

    const onUp = async (e: MouseEvent) => {
      if (!drag) return;
      const ppd = pixelsPorDia();
      const deltaDias = Math.round((e.clientX - drag.startX) / ppd);
      const deltaLinhaRaw = Math.round((e.clientY - drag.startY) / ALTURA_LINHA);
      const novaLinha = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + deltaLinhaRaw));

      if (Math.abs(deltaDias) < 1 && novaLinha === drag.startLinha) {
        setDrag(null); setTooltip(null); return;
      }

      setAtualizando(true);
      const novoInicio = addDias(parseDate(drag.at.data_inicio), deltaDias);
      const dur = diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim));
      const novoFim = addDias(novoInicio, dur);

      const { error } = await supabase.from('atividades').update({
        data_inicio: toStr(novoInicio),
        data_fim: toStr(novoFim),
        linha_index: novaLinha,
      }).eq('id', drag.at.id);

      if (!error) {
        setMensagem({ tipo: 'success', texto: `✅ ${drag.at.nome} movida` });
        await fetchDados();
      } else {
        setMensagem({ tipo: 'error', texto: '❌ Erro ao mover atividade' });
      }

      setDrag(null); setTooltip(null); setAtualizando(false);
      setTimeout(() => setMensagem(null), 3000);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [drag, supabase, dataMin, pixelsPorDia]);

  // ─── Editar linhas do bloco ───
  const handleSalvarLinhas = async (novasLinhas: number) => {
    if (!editandoBloco) return;
    setSalvandoLinhas(true);

    // Buscar todos os pavimentos do bloco
    const { data: pavData } = await supabase
      .from('pavimentos').select('*').eq('obra_id', obraId);

    const doBloco = (pavData || []).filter(p =>
      p.nome === editandoBloco.blocoNome || p.nome.startsWith(`${editandoBloco.blocoNome} - `)
    );

    // Atualizar o meta do 1º pavimento
    const primeiro = doBloco.find(p => p.observacao?.startsWith(PREFIXO_META));
    if (primeiro) {
      const meta = parseMeta(primeiro.observacao);
      await supabase.from('pavimentos').update({
        observacao: buildMeta(meta.tipo, meta.observacao, novasLinhas),
      }).eq('id', primeiro.id);
    } else if (doBloco.length > 0) {
      // Se não tem meta, criar
      await supabase.from('pavimentos').update({
        observacao: buildMeta('', '', novasLinhas),
      }).eq('id', doBloco[0].id);
    }

    setEditandoBloco(null);
    setSalvandoLinhas(false);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: `✅ Linhas do bloco atualizadas para ${novasLinhas}` });
    setTimeout(() => setMensagem(null), 3000);
  };

  const conflitos = useMemo(() => {
    const set = new Set<number>();
    const todas = pavimentos.flatMap(p => p.atividades.map(a => ({ ...a, pavNome: p.nome })));
    for (let i = 0; i < todas.length; i++)
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i], b = todas[j];
        if (a.equipe && b.equipe && a.equipe === b.equipe && a.pavimento_id !== b.pavimento_id) {
          if (parseDate(a.data_inicio) <= parseDate(b.data_fim) && parseDate(a.data_fim) >= parseDate(b.data_inicio)) {
            set.add(a.id); set.add(b.id);
          }
        }
      }
    return set;
  }, [pavimentos]);

  const totalAtividades = pavimentos.reduce((acc, p) => acc + p.atividades.length, 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <p className="text-slate-500">Carregando Linha de Balanço...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push(`/obras/${obraId}`)} className="text-blue-600 hover:text-blue-700 font-semibold">
                ← Voltar
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white">📊</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Linha de Balanço</h1>
                  <p className="text-sm text-slate-500">{obra?.nome}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{pavimentos.length}</p>
                <p className="text-xs text-slate-500">Pavimentos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{totalAtividades}</p>
                <p className="text-xs text-slate-500">Atividades</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{totalDias}</p>
                <p className="text-xs text-slate-500">Dias</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full px-6 py-6">
        {mensagem && (
          <div className={`mb-4 p-4 rounded-lg border font-medium ${
            mensagem.tipo === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>{mensagem.texto}</div>
        )}

        {/* Legenda */}
        {Object.keys(coresCache).length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">🎨 Legenda</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(coresCache).map(([nome, cor]) => (
                <div key={nome} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
                  <span className="text-xs text-slate-700">{nome}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalAtividades === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-16 text-center">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-slate-600 text-xl font-semibold mb-2">Nenhuma atividade cadastrada</p>
            <p className="text-slate-400 text-sm mb-6">Adicione atividades aos pavimentos para visualizar o gráfico</p>
            <button onClick={() => router.push(`/obras/${obraId}`)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
              Ir para a Obra
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" ref={containerRef}>
            {/* Info período */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
              📅 Período: <strong>{dataMin.toLocaleDateString('pt-BR')}</strong> — <strong>{addDias(dataMin, totalDias).toLocaleDateString('pt-BR')}</strong>
              <span className="ml-3 text-slate-400">({totalDias} dias)</span>
            </div>

            <div className="overflow-x-auto">
              <div style={{ minWidth: `${Math.max(800, totalDias * 8)}px` }}>

                {/* Eixo X */}
                <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 32 }}>
                  <div style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }} className="border-r border-slate-200 px-3 flex items-center">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
                  </div>
                  <div className="flex-1 relative">
                    {marcadores.map((m, i) => (
                      <div key={i} className="absolute flex flex-col items-center" style={{ left: `${(m.dia / totalDias) * 100}%` }}>
                        <div className="h-2 w-px bg-slate-300 mt-1"></div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Linhas de pavimentos */}
                {pavimentos.map((pav, pavIdx) => {
                  const alturaTotal = pav.numLinhas * ALTURA_LINHA;
                  const blocoNome = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : 'Sem Bloco';

                  return (
                    <div key={pav.id} className={`flex border-b border-slate-100 ${pavIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      style={{ height: alturaTotal }}>

                      {/* Coluna de nome — hover mostra editar */}
                      <div
                        style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
                        className="border-r border-slate-200 px-3 flex flex-col justify-center relative group cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => setEditandoBloco({ blocoNome, linhasAtuais: pav.numLinhas })}
                      >
                        <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{pav.nome}</p>
                        {pav.numero !== null && <p className="text-xs text-slate-400">Nº {pav.numero}</p>}
                        {pav.numLinhas > 1 && (
                          <p className="text-xs text-blue-500 font-medium">{pav.numLinhas} linhas</p>
                        )}
                        {/* Hint de editar */}
                        <div className="absolute inset-0 flex items-center justify-center bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs font-bold text-blue-700 bg-white px-2 py-1 rounded shadow">✏️ Editar linhas</span>
                        </div>
                      </div>

                      {/* Área de atividades com grade de linhas */}
                      <div className="flex-1 relative">
                        {/* Grade vertical */}
                        {marcadores.map((m, i) => (
                          <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: `${(m.dia / totalDias) * 100}%` }} />
                        ))}

                        {/* Linhas horizontais separadoras */}
                        {Array.from({ length: pav.numLinhas - 1 }, (_, i) => (
                          <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                            style={{ top: (i + 1) * ALTURA_LINHA }} />
                        ))}

                        {/* Atividades */}
                        {pav.atividades.map(at => {
                          const isDragging = drag?.at.id === at.id;
                          const displayDia = diffDias(dataMin, parseDate(at.data_inicio)) + (isDragging ? drag!.deltaDias : 0);
                          const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
                          const linhaAtual = isDragging
                            ? Math.max(0, Math.min(pav.numLinhas - 1, at.linha_index + drag!.deltaLinha))
                            : (at.linha_index ?? 0);

                          const left = `${(displayDia / totalDias) * 100}%`;
                          const width = `${(dur / totalDias) * 100}%`;
                          const top = linhaAtual * ALTURA_LINHA + 4;
                          const height = ALTURA_LINHA - 8;
                          const cor = getCor(at.nome);
                          const conflito = conflitos.has(at.id);

                          return (
                            <div
                              key={at.id}
                              className={`absolute rounded flex items-center px-2 cursor-grab active:cursor-grabbing select-none transition-opacity ${
                                isDragging ? 'opacity-60 ring-2 ring-blue-400 z-20' : 'hover:opacity-90 z-10'
                              } ${atualizando ? 'pointer-events-none' : ''}`}
                              style={{
                                left, width, top, height,
                                minWidth: 20,
                                backgroundColor: isDragging ? 'rgba(59,130,246,0.3)' : cor,
                                border: isDragging ? '2px solid #3B82F6' : conflito ? '2px solid #EF4444' : 'none',
                              }}
                              onMouseDown={e => handleMouseDown(e, at, pav)}
                              onMouseEnter={e => { if (!drag) setTooltip({ at, pav, x: e.clientX, y: e.clientY }); }}
                              onMouseLeave={() => { if (!drag) setTooltip(null); }}
                            >
                              <span className="text-white text-xs font-semibold truncate drop-shadow leading-none">
                                {at.nome}
                              </span>
                              {conflito && <span className="ml-1 text-xs">⚠️</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Legenda de uso */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📌 Como usar</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>🖱️ <strong>Arraste horizontalmente</strong> para reprogramar datas</li>
            <li>↕️ <strong>Arraste verticalmente</strong> para mover entre linhas do pavimento</li>
            <li>✏️ <strong>Clique no nome do pavimento</strong> para editar o número de linhas do bloco</li>
            <li>⚠️ <strong>Borda vermelha</strong> indica conflito de equipe entre pavimentos</li>
          </ul>
        </div>
      </main>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 pointer-events-none"
          style={{ left: tooltip.x + 16, top: tooltip.y - 80, minWidth: 220 }}>
          <p className="font-bold text-slate-900 mb-2">{tooltip.at.nome}</p>
          <div className="space-y-1 text-sm text-slate-600">
            <p>🏢 {tooltip.pav.nome}</p>
            <p>📅 Início: {fmtDate(tooltip.at.data_inicio)}</p>
            <p>📅 Fim: {fmtDate(tooltip.at.data_fim)}</p>
            <p>⏱️ {diffDias(parseDate(tooltip.at.data_inicio), parseDate(tooltip.at.data_fim)) + 1} dias</p>
            {tooltip.at.equipe && <p>👥 {tooltip.at.equipe}</p>}
            {drag && <p className="text-blue-600 font-semibold text-xs mt-1">🔄 Arraste para mover</p>}
          </div>
        </div>
      )}

      {/* Modal editar linhas do bloco */}
      {editandoBloco && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-1">📊 Linhas por Pavimento</h3>
            <p className="text-sm text-slate-500 mb-1">Bloco: <strong>{editandoBloco.blocoNome}</strong></p>
            <p className="text-xs text-slate-400 mb-5">Altera todos os pavimentos deste bloco</p>

            <div className="flex gap-3 justify-center mb-6">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setEditandoBloco({ ...editandoBloco, linhasAtuais: n })}
                  className={`w-14 h-14 rounded-xl font-bold text-lg transition-all ${
                    editandoBloco.linhasAtuais === n
                      ? 'bg-blue-600 text-white shadow-lg scale-110'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="bg-slate-50 rounded-lg p-3 mb-5 text-center">
              <p className="text-xs text-slate-500">Altura do pavimento no gráfico</p>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                {editandoBloco.linhasAtuais} linha{editandoBloco.linhasAtuais > 1 ? 's' : ''} × {ALTURA_LINHA}px = {editandoBloco.linhasAtuais * ALTURA_LINHA}px
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditandoBloco(null)}
                disabled={salvandoLinhas}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSalvarLinhas(editandoBloco.linhasAtuais)}
                disabled={salvandoLinhas}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold"
              >
                {salvandoLinhas ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {atualizando && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 shadow-xl text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-slate-600 font-medium">Salvando...</p>
          </div>
        </div>
      )}
    </div>
  );
}
