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
  linha_index: number;
  vinculo_id: string | null;   // UUID agrupa atividades vinculadas
  vinculo_ordem: number | null; // posição na cadeia (0 = primeira)
}
interface PavComAtiv extends Pavimento {
  atividades: Atividade[];
  numLinhas: number;
  blocoNome: string;
}

// ─── Meta helpers ───
const PREFIXO_META = '__BLOCO__';
const parseMeta = (obs: string | null) => {
  if (!obs?.startsWith(PREFIXO_META)) return { tipo: '', observacao: '', linhas: 1 };
  const raw = obs.replace(PREFIXO_META, '');
  const p = raw.split('||');
  const get = (k: string) => p.find(x => x.startsWith(k + '='))?.replace(k + '=', '') || '';
  return { tipo: get('tipo'), observacao: get('obs'), linhas: Math.max(1, Math.min(5, parseInt(get('linhas')) || 1)) };
};
const buildMeta = (tipo: string, obs: string, linhas: number) =>
  `${PREFIXO_META}tipo=${tipo}||obs=${obs}||linhas=${linhas}`;

// ─── Ordenação ───
const agruparPorBloco = (pavimentos: Pavimento[]) => {
  const g: Record<string, Pavimento[]> = {};
  pavimentos.forEach(p => {
    const b = p.nome.includes(' - ') ? p.nome.split(' - ')[0].trim() : 'Sem Bloco';
    if (!g[b]) g[b] = [];
    g[b].push(p);
  });
  return g;
};
const ordenarBlocos = (g: Record<string, Pavimento[]>): Array<[string, Pavimento[]]> =>
  Object.keys(g).sort((a, b) => {
    const aT = a.toLowerCase().includes('torre') || a.toLowerCase().includes('bloco');
    const bT = b.toLowerCase().includes('torre') || b.toLowerCase().includes('bloco');
    if (aT && !bT) return -1; if (!aT && bT) return 1;
    return a.localeCompare(b);
  }).map(k => [k, g[k].sort((a, b) => (b.numero ?? -Infinity) - (a.numero ?? -Infinity))]);

// ─── Cores ───
const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];
const coresCache: Record<string, string> = {};
let palIdx = 0;
const getCor = (nome: string) => { if (!coresCache[nome]) coresCache[nome] = PALETTE[palIdx++ % PALETTE.length]; return coresCache[nome]; };

// ─── Datas ───
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const diffDias = (a: Date, b: Date) => Math.round((b.getTime()-a.getTime())/86400000);
const addDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const toStr = (d: Date) => d.toISOString().split('T')[0];
const fmtDate = (s: string) => parseDate(s).toLocaleDateString('pt-BR');
const gerarUUID = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Layout ───
const ALTURA_LINHA = 44;
const LARGURA_NOME = 172;

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

  // Menu de contexto
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    tipo: 'vazio' | 'atividade';
    pav?: PavComAtiv; diaClicado?: number; linhaClicada?: number;
    at?: Atividade;
  } | null>(null);

  // Modal de criação
  const [modalCriar, setModalCriar] = useState<{
    pav: PavComAtiv; dataInicio: string; linha: number;
  } | null>(null);
  const [formCriar, setFormCriar] = useState({ nome: '', duracao: '5', equipe: '' });
  const [replicar, setReplicar] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [pavSelecionados, setPavSelecionados] = useState<number[]>([]);
  const [criando, setCriando] = useState(false);

  // Modal de edição
  const [modalEditar, setModalEditar] = useState<{at: Atividade; pav: PavComAtiv} | null>(null);
  const [formEditar, setFormEditar] = useState({ nome: '', dataInicio: '', dataFim: '', equipe: '' });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoAt, setExcluindoAt] = useState(false);

  // Modal de editar linhas do bloco
  const [editandoBloco, setEditandoBloco] = useState<{
    blocoNome: string; linhasAtuais: number; linhasOriginais: number;
    conflitosReducao: {atNome:string;pavNome:string;linha:number}[];
  } | null>(null);
  const [salvandoLinhas, setSalvandoLinhas] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => { fetchDados(); }, [obraId, supabase]);

  // Fechar menu de contexto ao clicar em qualquer lugar
  useEffect(() => {
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const fetchDados = async () => {
    try {
      setLoading(true);
      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });
      if (!pavData) return;

      const grupos = agruparPorBloco(pavData);
      const ordenados = ordenarBlocos(grupos).flatMap(([_, pavs]) => pavs);

      const numLinhasPorBloco: Record<string, number> = {};
      Object.entries(grupos).forEach(([blocoNome, pavs]) => {
        const p = pavs.find(p => p.observacao?.startsWith(PREFIXO_META));
        numLinhasPorBloco[blocoNome] = p ? parseMeta(p.observacao).linhas : 1;
      });

      const pavCompletos: PavComAtiv[] = await Promise.all(
        ordenados.map(async (pav) => {
          const blocoNome = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : 'Sem Bloco';
          const { data: ativData } = await supabase
            .from('atividades').select('*').eq('pavimento_id', pav.id).order('data_inicio');
          return {
            ...pav, blocoNome,
            atividades: (ativData || []).map(a => ({ ...a, linha_index: a.linha_index ?? 0, vinculo_id: a.vinculo_id ?? null, vinculo_ordem: a.vinculo_ordem ?? null })),
            numLinhas: numLinhasPorBloco[blocoNome] ?? 1,
          };
        })
      );
      setPavimentos(pavCompletos);
    } finally { setLoading(false); }
  };

  // ─── Datas mín/máx ───
  const { dataMin, totalDias } = useMemo(() => {
    const todas = pavimentos.flatMap(p => p.atividades);
    if (todas.length === 0) { const h = new Date(); return { dataMin: addDias(h, -5), totalDias: 60 }; }
    const datas = todas.flatMap(a => [parseDate(a.data_inicio), parseDate(a.data_fim)]);
    const min = addDias(new Date(Math.min(...datas.map(d => d.getTime()))), -5);
    const max = addDias(new Date(Math.max(...datas.map(d => d.getTime()))), 10);
    return { dataMin: min, totalDias: Math.max(30, diffDias(min, max)) };
  }, [pavimentos]);

  const marcadores = useMemo(() => {
    const step = totalDias <= 60 ? 7 : totalDias <= 180 ? 14 : 30;
    return Array.from({ length: Math.floor(totalDias / step) + 1 }, (_, i) => ({
      dia: i * step,
      label: addDias(dataMin, i * step).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    }));
  }, [dataMin, totalDias]);

  const ppd = useCallback(() => {
    if (!containerRef.current) return 10;
    return (containerRef.current.offsetWidth - LARGURA_NOME) / totalDias;
  }, [totalDias]);

  // ─── Conflitos ───
  const conflitos = useMemo(() => {
    const set = new Set<number>();
    const todas = pavimentos.flatMap(p => p.atividades.map(a => ({ ...a, pavId: p.id })));
    for (let i = 0; i < todas.length; i++) {
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i], b = todas[j];
        const overlap = parseDate(a.data_inicio) <= parseDate(b.data_fim) && parseDate(a.data_fim) >= parseDate(b.data_inicio);
        if (!overlap) continue;
        if (a.equipe && b.equipe && a.equipe === b.equipe && a.pavimento_id !== b.pavimento_id) { set.add(a.id); set.add(b.id); }
        if (a.pavimento_id === b.pavimento_id && (a.linha_index ?? 0) === (b.linha_index ?? 0)) { set.add(a.id); set.add(b.id); }
      }
    }
    return set;
  }, [pavimentos]);

  // ─── Drag ───
  const handleMouseDown = (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setCtxMenu(null);
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
      const d = Math.round((e.clientX - drag.startX) / ppd());
      const dl = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + Math.round((e.clientY - drag.startY) / ALTURA_LINHA))) - drag.startLinha;
      setDrag(prev => prev ? { ...prev, deltaDias: d, deltaLinha: dl } : null);
      const ni = addDias(parseDate(drag.at.data_inicio), d);
      const dur = diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim));
      setTooltip({ at: { ...drag.at, data_inicio: toStr(ni), data_fim: toStr(addDias(ni, dur)), linha_index: drag.startLinha + dl }, pav: drag.pav, x: e.clientX, y: e.clientY });
    };

    const onUp = async (e: MouseEvent) => {
      if (!drag) return;
      const deltaDias = Math.round((e.clientX - drag.startX) / ppd());
      const novaLinha = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + Math.round((e.clientY - drag.startY) / ALTURA_LINHA)));

      if (Math.abs(deltaDias) < 1 && novaLinha === drag.startLinha) { setDrag(null); setTooltip(null); return; }

      setAtualizando(true);
      const novoInicio = addDias(parseDate(drag.at.data_inicio), deltaDias);
      const dur = diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim));
      const novoFim = addDias(novoInicio, dur);

      // Se tem vínculo e movimento horizontal, propagar cadeia
      if (drag.at.vinculo_id && deltaDias !== 0) {
        await propagarVinculo(drag.at, deltaDias, novaLinha, novoInicio, novoFim);
      } else {
        await supabase.from('atividades').update({
          data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha,
        }).eq('id', drag.at.id);
      }

      setMensagem({ tipo: 'success', texto: `✅ ${drag.at.nome} movida` });
      await fetchDados();
      setDrag(null); setTooltip(null); setAtualizando(false);
      setTimeout(() => setMensagem(null), 3000);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [drag, supabase, dataMin, ppd]);

  // ─── Propagar vínculo em cascata ───
  const propagarVinculo = async (atOrigem: Atividade, deltaDias: number, novaLinha: number, novoInicio: Date, novoFim: Date) => {
    if (!atOrigem.vinculo_id) return;

    // Buscar toda a cadeia
    const { data: cadeia } = await supabase
      .from('atividades').select('*')
      .eq('vinculo_id', atOrigem.vinculo_id)
      .order('vinculo_ordem');

    if (!cadeia) return;

    // Atualizar a atividade origem
    await supabase.from('atividades').update({
      data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha,
    }).eq('id', atOrigem.id);

    // Recalcular as datas dos sucessores em cascata
    let refFim = novoFim;
    for (const item of cadeia) {
      if (item.id === atOrigem.id) continue;
      if ((item.vinculo_ordem ?? 0) <= (atOrigem.vinculo_ordem ?? 0)) continue;

      const dur = diffDias(parseDate(item.data_inicio), parseDate(item.data_fim));
      const novaData = addDias(refFim, 1);
      const novaDataFim = addDias(novaData, dur);

      await supabase.from('atividades').update({
        data_inicio: toStr(novaData), data_fim: toStr(novaDataFim),
      }).eq('id', item.id);

      refFim = novaDataFim;
    }
  };

  // ─── Menu de Contexto ───
  const handleContextMenu = (e: React.MouseEvent, pav: PavComAtiv, diaClicado: number, linhaClicada: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, tipo: 'vazio', pav, diaClicado, linhaClicada });
  };

  const handleContextMenuAt = (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, tipo: 'atividade', at, pav });
  };

  // ─── Abrir modal de criar ───
  const abrirCriar = () => {
    if (!ctxMenu?.pav || ctxMenu.diaClicado === undefined) return;
    const dataInicio = toStr(addDias(dataMin, ctxMenu.diaClicado));
    setModalCriar({ pav: ctxMenu.pav, dataInicio, linha: ctxMenu.linhaClicada ?? 0 });
    setFormCriar({ nome: '', duracao: '5', equipe: '' });
    setReplicar(false); setVincular(false); setPavSelecionados([]);
    setCtxMenu(null);
  };

  // ─── Pavimentos do mesmo bloco (para replicar/vincular) ───
  const pavimentosDoBloco = useMemo(() => {
    if (!modalCriar) return [];
    return pavimentos.filter(p =>
      p.blocoNome === modalCriar.pav.blocoNome && p.id !== modalCriar.pav.id
    );
  }, [modalCriar, pavimentos]);

  // ─── Criar atividade(s) ───
  const handleCriar = async () => {
    if (!modalCriar || !formCriar.nome.trim()) return;
    setCriando(true);

    const duracao = parseInt(formCriar.duracao) || 1;
    const vinculoId = (replicar && vincular && pavSelecionados.length > 0) ? gerarUUID() : null;

    // Pavimentos para criar: o origem + selecionados (se replicar)
    const pavParaCriar: PavComAtiv[] = [modalCriar.pav];
    if (replicar && pavSelecionados.length > 0) {
      pavSelecionados.forEach(id => {
        const p = pavimentos.find(p => p.id === id);
        if (p) pavParaCriar.push(p);
      });
    }

    // Ordenar por número crescente: inferior executa primeiro, superior depois
    pavParaCriar.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));

    let dataInicioAtual = parseDate(modalCriar.dataInicio);
    let ordem = 0;

    for (const pav of pavParaCriar) {
      const dataFim = addDias(dataInicioAtual, duracao - 1);
      await supabase.from('atividades').insert({
        pavimento_id: pav.id,
        nome: formCriar.nome.trim(),
        data_inicio: toStr(dataInicioAtual),
        data_fim: toStr(dataFim),
        duracao_dias: duracao,
        equipe: formCriar.equipe.trim() || null,
        linha_index: modalCriar.linha,
        vinculo_id: vinculoId,
        vinculo_ordem: vinculoId ? ordem++ : null,
      });

      // Se vincular, próxima começa no dia seguinte ao fim desta
      if (vincular && vinculoId) {
        dataInicioAtual = addDias(dataFim, 1);
      }
    }

    setModalCriar(null);
    setCriando(false);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: `✅ ${pavParaCriar.length} atividade(s) criada(s)!` });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Abrir modal de editar ───
  const abrirEditar = () => {
    if (!ctxMenu?.at || !ctxMenu.pav) return;
    setModalEditar({ at: ctxMenu.at, pav: ctxMenu.pav });
    setFormEditar({
      nome: ctxMenu.at.nome,
      dataInicio: ctxMenu.at.data_inicio,
      dataFim: ctxMenu.at.data_fim,
      equipe: ctxMenu.at.equipe || '',
    });
    setCtxMenu(null);
  };

  // ─── Salvar edição ───
  const handleSalvarEdicao = async () => {
    if (!modalEditar) return;
    setSalvandoEdicao(true);
    const dur = diffDias(parseDate(formEditar.dataInicio), parseDate(formEditar.dataFim)) + 1;
    await supabase.from('atividades').update({
      nome: formEditar.nome,
      data_inicio: formEditar.dataInicio,
      data_fim: formEditar.dataFim,
      duracao_dias: dur,
      equipe: formEditar.equipe || null,
    }).eq('id', modalEditar.at.id);
    setModalEditar(null);
    setSalvandoEdicao(false);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: '✅ Atividade atualizada!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Excluir atividade ───
  const handleExcluirAtividade = async () => {
    if (!modalEditar) return;
    if (!confirm(`Excluir "${modalEditar.at.nome}"?`)) return;
    setExcluindoAt(true);
    await supabase.from('atividades').delete().eq('id', modalEditar.at.id);
    setModalEditar(null);
    setExcluindoAt(false);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: '✅ Atividade excluída!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Quebrar vínculo ───
  const handleQuebrarVinculo = async () => {
    if (!modalEditar?.at.vinculo_id) return;
    await supabase.from('atividades').update({ vinculo_id: null, vinculo_ordem: null }).eq('id', modalEditar.at.id);
    setModalEditar(prev => prev ? { ...prev, at: { ...prev.at, vinculo_id: null, vinculo_ordem: null } } : null);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: '✅ Vínculo quebrado!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Reativar vínculo ───
  const [modalVincular, setModalVincular] = useState<{at: Atividade} | null>(null);

  const handleReativarVinculo = async (atAlvo: Atividade) => {
    if (!modalEditar) return;
    // Criar novo grupo de vínculo entre as duas
    const novoVinculoId = gerarUUID();
    // Ordenar: quem termina antes é vinculo_ordem 0
    const atA = modalEditar.at;
    const [primeiro, segundo] = parseDate(atA.data_fim) <= parseDate(atAlvo.data_inicio) ? [atA, atAlvo] : [atAlvo, atA];

    await supabase.from('atividades').update({ vinculo_id: novoVinculoId, vinculo_ordem: 0 }).eq('id', primeiro.id);
    await supabase.from('atividades').update({ vinculo_id: novoVinculoId, vinculo_ordem: 1 }).eq('id', segundo.id);

    setModalVincular(null);
    setModalEditar(null);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: '✅ Vínculo reativado!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Editar linhas do bloco ───
  const calcularConflitosReducao = (blocoNome: string, novasLinhas: number) => {
    return pavimentos
      .filter(p => p.nome === blocoNome || p.nome.startsWith(`${blocoNome} - `))
      .flatMap(pav => pav.atividades
        .filter(at => (at.linha_index ?? 0) >= novasLinhas)
        .map(at => ({ atNome: at.nome, pavNome: pav.nome, linha: (at.linha_index ?? 0) + 1 }))
      );
  };

  const abrirEditarBloco = (blocoNome: string, linhasAtuais: number) => {
    setEditandoBloco({ blocoNome, linhasAtuais, linhasOriginais: linhasAtuais, conflitosReducao: [] });
  };

  const handleSalvarLinhas = async (novasLinhas: number) => {
    if (!editandoBloco) return;
    if (novasLinhas < editandoBloco.linhasOriginais) {
      const c = calcularConflitosReducao(editandoBloco.blocoNome, novasLinhas);
      if (c.length > 0) { setEditandoBloco(prev => prev ? { ...prev, linhasAtuais: novasLinhas, conflitosReducao: c } : null); return; }
    }
    setSalvandoLinhas(true);
    const { data: pavData } = await supabase.from('pavimentos').select('*').eq('obra_id', obraId);
    const doBloco = (pavData || []).filter(p => p.nome === editandoBloco.blocoNome || p.nome.startsWith(`${editandoBloco.blocoNome} - `));
    const primeiro = doBloco.find(p => p.observacao?.startsWith(PREFIXO_META));
    const alvo = primeiro || doBloco[0];
    if (alvo) {
      const meta = parseMeta(alvo.observacao);
      await supabase.from('pavimentos').update({ observacao: buildMeta(meta.tipo, meta.observacao, novasLinhas) }).eq('id', alvo.id);
    }
    setEditandoBloco(null); setSalvandoLinhas(false);
    await fetchDados();
    setMensagem({ tipo: 'success', texto: `✅ Linhas atualizadas para ${novasLinhas}` });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Atividades vinculadas (para destaque) ───
  const atividadesVinculadas = useMemo(() => {
    const map: Record<string, number[]> = {};
    pavimentos.forEach(p => p.atividades.forEach(a => {
      if (a.vinculo_id) { if (!map[a.vinculo_id]) map[a.vinculo_id] = []; map[a.vinculo_id].push(a.id); }
    }));
    return map;
  }, [pavimentos]);

  const totalAtividades = pavimentos.reduce((acc, p) => acc + p.atividades.length, 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div><p className="text-slate-500">Carregando...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" onContextMenu={e => e.preventDefault()}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push(`/obras/${obraId}`)} className="text-blue-600 hover:text-blue-700 font-semibold">← Voltar</button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white">📊</span></div>
              <div><h1 className="text-xl font-bold text-slate-900">Linha de Balanço</h1><p className="text-sm text-slate-500">{obra?.nome}</p></div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {[{ v: pavimentos.length, l: 'Pavimentos', c: 'blue' }, { v: totalAtividades, l: 'Atividades', c: 'green' }, { v: totalDias, l: 'Dias', c: 'orange' }].map(({ v, l, c }) => (
              <div key={l} className="text-center">
                <p className={`text-2xl font-bold text-${c}-600`}>{v}</p>
                <p className="text-xs text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-full px-6 py-6">
        {mensagem && (
          <div className={`mb-4 p-4 rounded-lg border font-medium ${mensagem.tipo === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {mensagem.texto}
          </div>
        )}

        {/* Legenda */}
        {Object.keys(coresCache).length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-slate-700 mr-2">🎨 Legenda:</span>
            {Object.entries(coresCache).map(([nome, cor]) => (
              <div key={nome} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
                <span className="text-xs text-slate-700">{nome}</span>
              </div>
            ))}
          </div>
        )}

        {/* Gráfico */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" ref={containerRef}>
          <div className="p-3 border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            📅 {dataMin.toLocaleDateString('pt-BR')} — {addDias(dataMin, totalDias).toLocaleDateString('pt-BR')} &nbsp;|&nbsp; Botão direito para criar ou editar atividades
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

              {/* Pavimentos */}
              {pavimentos.map((pav, pavIdx) => {
                const alturaTotal = pav.numLinhas * ALTURA_LINHA;
                return (
                  <div key={pav.id} className={`flex border-b border-slate-100 ${pavIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`} style={{ height: alturaTotal }}>
                    {/* Nome */}
                    <div
                      style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
                      className="border-r border-slate-200 px-3 flex flex-col justify-center relative group cursor-pointer hover:bg-blue-50 transition-colors"
                      onClick={() => abrirEditarBloco(pav.blocoNome, pav.numLinhas)}
                    >
                      <p className="text-xs font-semibold text-slate-800 truncate">{pav.nome}</p>
                      {pav.numero !== null && <p className="text-xs text-slate-400">Nº {pav.numero}</p>}
                      {pav.numLinhas > 1 && <p className="text-xs text-blue-400">{pav.numLinhas} linhas</p>}
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs font-bold text-blue-700 bg-white px-2 py-1 rounded shadow">✏️ Linhas</span>
                      </div>
                    </div>

                    {/* Área de atividades */}
                    <div
                      className="flex-1 relative"
                      onContextMenu={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const xRel = e.clientX - rect.left;
                        const yRel = e.clientY - rect.top;
                        const diaClicado = Math.floor((xRel / rect.width) * totalDias);
                        const linhaClicada = Math.floor(yRel / ALTURA_LINHA);
                        handleContextMenu(e, pav, diaClicado, linhaClicada);
                      }}
                    >
                      {/* Grade vertical */}
                      {marcadores.map((m, i) => (
                        <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: `${(m.dia / totalDias) * 100}%` }} />
                      ))}
                      {/* Linhas separadoras */}
                      {Array.from({ length: pav.numLinhas - 1 }, (_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-200" style={{ top: (i + 1) * ALTURA_LINHA }} />
                      ))}

                      {/* Atividades */}
                      {pav.atividades.map(at => {
                        const isDragging = drag?.at.id === at.id;
                        const dispDia = diffDias(dataMin, parseDate(at.data_inicio)) + (isDragging ? drag!.deltaDias : 0);
                        const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
                        const linhaAt = isDragging ? Math.max(0, Math.min(pav.numLinhas - 1, at.linha_index + drag!.deltaLinha)) : (at.linha_index ?? 0);
                        const cor = getCor(at.nome);
                        const temConflito = conflitos.has(at.id);
                        const temVinculo = !!at.vinculo_id;

                        return (
                          <div
                            key={at.id}
                            className={`absolute rounded flex items-center px-2 select-none z-10 ${isDragging ? 'opacity-60 cursor-grabbing z-20' : 'cursor-grab hover:opacity-90'} ${atualizando ? 'pointer-events-none' : ''}`}
                            style={{
                              left: `${(dispDia / totalDias) * 100}%`,
                              width: `${(dur / totalDias) * 100}%`,
                              top: linhaAt * ALTURA_LINHA + 4,
                              height: ALTURA_LINHA - 8,
                              minWidth: 20,
                              backgroundColor: isDragging ? 'rgba(59,130,246,0.25)' : cor,
                              border: isDragging ? '2px dashed #3B82F6' : temConflito ? '2px solid #EF4444' : temVinculo ? '2px solid rgba(255,255,255,0.6)' : 'none',
                              boxShadow: temVinculo && !temConflito ? '0 0 0 1px rgba(255,255,255,0.4)' : undefined,
                            }}
                            onMouseDown={e => handleMouseDown(e, at, pav)}
                            onContextMenu={e => handleContextMenuAt(e, at, pav)}
                            onMouseEnter={e => { if (!drag) setTooltip({ at, pav, x: e.clientX, y: e.clientY }); }}
                            onMouseLeave={() => { if (!drag) setTooltip(null); }}
                          >
                            <span className="text-white text-xs font-semibold truncate drop-shadow leading-none flex-1">
                              {at.nome}
                            </span>
                            {temVinculo && <span className="text-white/80 text-xs ml-1">🔗</span>}
                            {temConflito && <span className="text-xs ml-1">⚠️</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Área vazia se sem pavimentos */}
              {pavimentos.length === 0 && (
                <div className="p-16 text-center text-slate-400">
                  <p className="text-4xl mb-3">📊</p>
                  <p>Nenhum pavimento cadastrado</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="font-semibold text-blue-900 mb-1">📌 Como usar</p>
          <div className="grid grid-cols-2 gap-1 text-sm text-blue-800">
            <p>🖱️ <strong>Botão direito na área vazia</strong> → criar atividade</p>
            <p>🖱️ <strong>Botão direito na atividade</strong> → editar / excluir</p>
            <p>↔️ <strong>Arraste horizontal</strong> → reprogramar datas</p>
            <p>↕️ <strong>Arraste vertical</strong> → mover entre linhas</p>
            <p>🔗 <strong>Atividades vinculadas</strong> movem toda a cadeia</p>
            <p>✏️ <strong>Clique no nome</strong> → editar linhas do bloco</p>
          </div>
        </div>
      </main>

      {/* ─── Menu de contexto ─── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-44"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.tipo === 'vazio' && (
            <>
              <div className="px-3 py-1.5 text-xs text-slate-400 font-semibold border-b border-slate-100 mb-1">
                {ctxMenu.pav?.nome} — Linha {(ctxMenu.linhaClicada ?? 0) + 1}
              </div>
              <button onClick={abrirCriar}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
                ✨ Nova atividade aqui
              </button>
            </>
          )}
          {ctxMenu.tipo === 'atividade' && (
            <>
              <div className="px-3 py-1.5 text-xs text-slate-400 font-semibold border-b border-slate-100 mb-1 truncate max-w-48">
                {ctxMenu.at?.nome}
              </div>
              <button onClick={abrirEditar}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
                ✏️ Editar atividade
              </button>
              {ctxMenu.at?.vinculo_id && (
                <button onClick={() => { setModalVincular(null); abrirEditar(); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-yellow-50 hover:text-yellow-700 flex items-center gap-2">
                  🔗 Gerenciar vínculo
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Tooltip ─── */}
      {tooltip && !ctxMenu && (
        <div className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 pointer-events-none"
          style={{ left: tooltip.x + 16, top: tooltip.y - 80, minWidth: 220 }}>
          <p className="font-bold text-slate-900 mb-2">{tooltip.at.nome}</p>
          <div className="space-y-1 text-sm text-slate-600">
            <p>🏢 {tooltip.pav.nome}</p>
            <p>📅 {fmtDate(tooltip.at.data_inicio)} → {fmtDate(tooltip.at.data_fim)}</p>
            <p>⏱️ {diffDias(parseDate(tooltip.at.data_inicio), parseDate(tooltip.at.data_fim)) + 1} dias</p>
            {tooltip.at.equipe && <p>👥 {tooltip.at.equipe}</p>}
            {tooltip.at.vinculo_id && <p className="text-blue-600 font-semibold">🔗 Vinculada</p>}
          </div>
        </div>
      )}

      {/* ─── Modal Criar Atividade ─── */}
      {modalCriar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">✨ Nova Atividade</h3>
            <p className="text-xs text-slate-500 mb-5">{modalCriar.pav.nome} — Linha {modalCriar.linha + 1} — a partir de {fmtDate(modalCriar.dataInicio)}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome *</label>
                <input type="text" value={formCriar.nome} onChange={e => setFormCriar(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Estrutura, Reboco, Pintura"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Duração (dias) *</label>
                  <input type="number" min="1" value={formCriar.duracao} onChange={e => setFormCriar(p => ({ ...p, duracao: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe (opcional)</label>
                  <input type="text" value={formCriar.equipe} onChange={e => setFormCriar(p => ({ ...p, equipe: e.target.value }))}
                    placeholder="Ex: Equipe A"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>

              {/* Preview data */}
              <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                📅 <strong>{fmtDate(modalCriar.dataInicio)}</strong> até <strong>{fmtDate(toStr(addDias(parseDate(modalCriar.dataInicio), (parseInt(formCriar.duracao) || 1) - 1)))}</strong>
              </div>

              {/* Replicar e Vincular */}
              {pavimentosDoBloco.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={replicar} onChange={e => { setReplicar(e.target.checked); if (!e.target.checked) { setVincular(false); setPavSelecionados([]); } }}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm font-semibold text-slate-700">📋 Replicar em outros pavimentos do bloco</span>
                  </label>

                  {replicar && (
                    <>
                      {/* Checkboxes de pavimentos */}
                      <div className="ml-6 space-y-1 max-h-36 overflow-y-auto">
                        <label className="flex items-center gap-2 text-xs text-slate-500 mb-2 cursor-pointer">
                          <input type="checkbox"
                            checked={pavSelecionados.length === pavimentosDoBloco.length}
                            onChange={e => setPavSelecionados(e.target.checked ? pavimentosDoBloco.map(p => p.id) : [])}
                            className="w-3.5 h-3.5 rounded accent-blue-600" />
                          Selecionar todos
                        </label>
                        {pavimentosDoBloco.map(p => (
                          <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                            <input type="checkbox"
                              checked={pavSelecionados.includes(p.id)}
                              onChange={e => setPavSelecionados(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                              className="w-4 h-4 rounded accent-blue-600" />
                            {p.nome.includes(' - ') ? p.nome.split(' - ').slice(1).join(' - ') : p.nome}
                            {p.numero !== null && <span className="text-xs text-slate-400">Nº {p.numero}</span>}
                          </label>
                        ))}
                      </div>

                      {/* Vincular */}
                      {pavSelecionados.length > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer mt-2">
                          <input type="checkbox" checked={vincular} onChange={e => setVincular(e.target.checked)}
                            className="w-4 h-4 rounded accent-purple-600" />
                          <div>
                            <span className="text-sm font-semibold text-slate-700">🔗 Vincular em cascata</span>
                            <p className="text-xs text-slate-500">Cada pavimento começa 1 dia após o fim do anterior</p>
                          </div>
                        </label>
                      )}

                      {/* Preview cascata */}
                      {vincular && pavSelecionados.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-purple-800 mb-2">🔗 Preview da cascata:</p>
                          <div className="space-y-1 text-xs text-purple-700">
                            {(() => {
                              const dur = parseInt(formCriar.duracao) || 1;
                              const pavOrdenados = [modalCriar.pav, ...pavimentosDoBloco.filter(p => pavSelecionados.includes(p.id))]
                                .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
                              let dataAtual = parseDate(modalCriar.dataInicio);
                              return pavOrdenados.map((p, i) => {
                                const ini = toStr(dataAtual);
                                const fim = toStr(addDias(dataAtual, dur - 1));
                                if (i > 0) dataAtual = addDias(parseDate(fim), 1);
                                else dataAtual = addDias(parseDate(fim), 1);
                                const nomePav = p.nome.includes(' - ') ? p.nome.split(' - ').slice(1).join(' - ') : p.nome;
                                return <p key={p.id}>• {nomePav}: {fmtDate(ini)} → {fmtDate(fim)}</p>;
                              });
                            })()}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalCriar(null)} disabled={criando}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleCriar} disabled={criando || !formCriar.nome.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
                {criando ? '⏳ Criando...' : `✨ Criar${replicar && pavSelecionados.length > 0 ? ` (${1 + pavSelecionados.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Editar Atividade ─── */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4">✏️ Editar Atividade</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome</label>
                <input type="text" value={formEditar.nome} onChange={e => setFormEditar(p => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label>
                  <input type="date" value={formEditar.dataInicio} onChange={e => setFormEditar(p => ({ ...p, dataInicio: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Data Fim</label>
                  <input type="date" value={formEditar.dataFim} onChange={e => setFormEditar(p => ({ ...p, dataFim: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
                <input type="text" value={formEditar.equipe} onChange={e => setFormEditar(p => ({ ...p, equipe: e.target.value }))}
                  placeholder="Ex: Equipe A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>

              {/* Vínculo */}
              {modalEditar.at.vinculo_id ? (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-purple-800">🔗 Atividade vinculada</p>
                      <p className="text-xs text-purple-600">Ordem na cadeia: {(modalEditar.at.vinculo_ordem ?? 0) + 1}ª</p>
                    </div>
                    <button onClick={handleQuebrarVinculo}
                      className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">
                      ✂️ Quebrar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">🔗 Sem vínculo</p>
                      <p className="text-xs text-slate-500">Atividade independente</p>
                    </div>
                    <button onClick={() => setModalVincular({ at: modalEditar.at })}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold hover:bg-purple-200">
                      + Vincular
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={handleExcluirAtividade} disabled={excluindoAt || salvandoEdicao}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 text-sm">
                {excluindoAt ? '⏳' : '🗑️'}
              </button>
              <button onClick={() => setModalEditar(null)} disabled={salvandoEdicao}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSalvarEdicao} disabled={salvandoEdicao}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
                {salvandoEdicao ? '⏳' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Reativar Vínculo ─── */}
      {modalVincular && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-1">🔗 Vincular Atividade</h3>
            <p className="text-xs text-slate-500 mb-4">Selecione a atividade que deve preceder <strong>{modalVincular.at.nome}</strong></p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pavimentos.flatMap(pav => pav.atividades
                .filter(a => a.id !== modalVincular.at.id)
                .map(at => ({ at, pav }))
              ).map(({ at, pav }) => (
                <button key={at.id} onClick={() => handleReativarVinculo(at)}
                  className="w-full text-left p-3 border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors">
                  <p className="text-sm font-semibold text-slate-900">{at.nome}</p>
                  <p className="text-xs text-slate-500">{pav.nome} · {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</p>
                </button>
              ))}
            </div>

            <button onClick={() => setModalVincular(null)}
              className="w-full mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal Editar Linhas ─── */}
      {editandoBloco && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-1">📊 Linhas por Pavimento</h3>
            <p className="text-sm text-slate-500 mb-1">Bloco: <strong>{editandoBloco.blocoNome}</strong></p>
            <p className="text-xs text-slate-400 mb-5">Altera todos os pavimentos deste bloco</p>

            <div className="flex gap-3 justify-center mb-4">
              {[1,2,3,4,5].map(n => {
                const c = n < editandoBloco.linhasOriginais ? calcularConflitosReducao(editandoBloco.blocoNome, n) : [];
                const temC = c.length > 0;
                const sel = editandoBloco.linhasAtuais === n;
                return (
                  <button key={n}
                    onClick={() => setEditandoBloco(prev => prev ? { ...prev, linhasAtuais: n, conflitosReducao: temC ? c : [] } : null)}
                    className={`w-14 h-14 rounded-xl font-bold text-lg transition-all relative ${sel ? temC ? 'bg-red-500 text-white shadow-lg scale-110' : 'bg-blue-600 text-white shadow-lg scale-110' : temC ? 'bg-red-50 text-red-600 border-2 border-red-300' : 'bg-slate-100 text-slate-700 hover:bg-blue-100'}`}>
                    {n}
                    {temC && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">!</span>}
                  </button>
                );
              })}
            </div>

            {editandoBloco.conflitosReducao.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm font-bold text-red-800 mb-2">⚠️ Mova estas atividades antes de reduzir:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {editandoBloco.conflitosReducao.map((c, i) => (
                    <p key={i} className="text-xs text-red-700 bg-red-100 rounded px-2 py-1">• <strong>{c.atNome}</strong> — {c.pavNome} (linha {c.linha})</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setEditandoBloco(null)} disabled={salvandoLinhas}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleSalvarLinhas(editandoBloco.linhasAtuais)}
                disabled={salvandoLinhas || editandoBloco.conflitosReducao.length > 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold">
                {salvandoLinhas ? '⏳' : editandoBloco.conflitosReducao.length > 0 ? '🚫 Resolva conflitos' : '💾 Salvar'}
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
