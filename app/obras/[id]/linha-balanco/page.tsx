'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─── Interfaces ───
interface Obra {
  id: number; nome: string;
  sabado_util: boolean; domingo_util: boolean;
  data_inicio: string | null; data_fim: string | null;
}
interface Feriado { id: number; obra_id: number; data: string; nome: string; }
interface Pavimento {
  id: number; obra_id: number; nome: string;
  numero: number | null; observacao: string | null;
}
interface Subatividade {
  id: number;
  atividade_id: number;
  nome: string;
  duracao: number;
  equipe: string | null;
  efetivo: number | null;
  ordem: number;
  cor?: string; // calculado no front
}
interface Atividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  efetivo: number | null;
  linha_index: number;
  vinculo_id: string | null;
  vinculo_ordem: number | null;
  subatividades?: Subatividade[];
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

// Paleta para segmentos de subatividades (derivada da cor pai com variações)
const SUB_PALETTE = ['#1D4ED8','#047857','#B45309','#991B1B','#6D28D9','#BE185D','#0F766E','#C2410C','#4338CA','#4D7C0F',
  '#2563EB','#059669','#D97706','#DC2626','#7C3AED','#DB2777','#0D9488','#EA580C','#4F46E5','#65A30D'];
const getCorSub = (atividadeNome: string, subIndex: number): string => {
  const baseIdx = PALETTE.findIndex(c => c === coresCache[atividadeNome]);
  const offset = baseIdx >= 0 ? baseIdx * 2 : 0;
  return SUB_PALETTE[(offset + subIndex) % SUB_PALETTE.length];
};

// Calcular duração total das subatividades
const calcDuracaoTotal = (subs: {duracao: number}[]) => subs.reduce((acc, s) => acc + (s.duracao || 0), 0);

// ─── Datas base ───
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const diffDias = (a: Date, b: Date) => Math.round((b.getTime()-a.getTime())/86400000);
const addDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const toStr = (d: Date) => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
const fmtDate = (s: string) => parseDate(s).toLocaleDateString('pt-BR');

// Labels e cores do calendário
const LABEL_DIA = ['D','S','T','Q','Q','S','S'];

const corColunaDia = (data: Date, feriadosSet: Set<string>, sabUtil: boolean, domUtil: boolean): string | undefined => {
  const dia = data.getDay();
  const s = toStr(data);
  if (feriadosSet.has(s)) return 'rgba(239,68,68,0.12)';
  if (dia === 0) return domUtil ? undefined : 'rgba(99,102,241,0.12)';
  if (dia === 6) return sabUtil ? undefined : 'rgba(99,102,241,0.06)';
  return undefined;
};

// Adicionar N dias úteis
// Avançar até o próximo dia útil (inclusive o próprio dia)
const proximoDiaUtil = (data: Date, feriadosSet: Set<string>, sabUtil: boolean, domUtil: boolean): Date => {
  const r = new Date(data);
  while (true) {
    const dia = r.getDay();
    const s = toStr(r);
    if (!feriadosSet.has(s) && !(dia === 6 && !sabUtil) && !(dia === 0 && !domUtil)) return r;
    r.setDate(r.getDate() + 1);
  }
};

const addDiasUteis = (data: Date, dias: number, feriadosSet: Set<string>, sabUtil: boolean, domUtil: boolean): Date => {
  const r = new Date(data);
  let restante = Math.abs(dias);
  const dir = dias >= 0 ? 1 : -1;
  while (restante > 0) {
    r.setDate(r.getDate() + dir);
    const dia = r.getDay();
    const s = toStr(r);
    if (!feriadosSet.has(s) && !(dia === 6 && !sabUtil) && !(dia === 0 && !domUtil)) restante--;
  }
  return r;
};

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
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [mensagem, setMensagem] = useState<{tipo:'success'|'error';texto:string}|null>(null);

  // Calendário
  const feriadosSet = useMemo(() => new Set(feriados.map(f => f.data)), [feriados]);
  const sabadoUtil = obra?.sabado_util ?? false;
  const domingoUtil = obra?.domingo_util ?? false;

  // Refs para valores sempre atuais dentro de callbacks e effects
  const calendarioRef = useRef({ feriadosSet, sabadoUtil, domingoUtil });
  useEffect(() => {
    calendarioRef.current = { feriadosSet, sabadoUtil, domingoUtil };
  }, [feriadosSet, sabadoUtil, domingoUtil]);

  // Zoom / Filtro de datas
  const [zoomInicio, setZoomInicio] = useState('');
  const [zoomFim, setZoomFim] = useState('');

  // Tela cheia e filtros avançados
  const [telaCheia, setTelaCheia] = useState(false);
  const [pavimentosFiltro, setPavimentosFiltro] = useState<Set<number>>(new Set()); // vazio = todos
  const [modalFiltros, setModalFiltros] = useState(false);
  const telaCheiaPrintRef = useRef<HTMLDivElement>(null);

  // ─── Versões ───
  interface Versao {
    id: number; obra_id: number; nome: string;
    descricao: string | null; status: 'Definitiva' | 'Em Atualização';
    snapshot: any; created_at: string;
  }
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoAtual, setVersaoAtual] = useState<Versao | null>(null);

  // ─── snapshotBase e modoRascunho — devem vir ANTES de pavimentosExibidos ───
  const [snapshotBase, setSnapshotBase] = useState<any | null>(null);
  const modoRascunho = snapshotBase !== null;

  // ─── Converter snapshot em PavComAtiv — declarado ANTES de qualquer useMemo ───
  const snapshotParaPavimentos = (snapshot: any): PavComAtiv[] => {
    if (!snapshot?.pavimentos) return [];
    return (snapshot.pavimentos as any[]).map(pav => ({
      id: pav.id, obra_id: obraId, nome: pav.nome,
      numero: pav.numero ?? null, observacao: null,
      blocoNome: pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : pav.nome,
      numLinhas: pav.numLinhas ?? 1,
      atividades: (pav.atividades || []).map((at: any, _: number) => ({
        ...at,
        linha_index: at.linha_index ?? 0,
        vinculo_id: at.vinculo_id ?? null,
        vinculo_ordem: at.vinculo_ordem ?? null,
        efetivo: at.efetivo ?? null,
        subatividades: (at.subatividades || []).map((s: any, i: number) => ({
          ...s, cor: getCorSub(at.nome, i),
        })),
      })),
    }));
  };

  // ─── Pavimentos a exibir ───
  // Prioridade:
  // Regra simples:
  // - Versão Definitiva (sem rascunho) → snapshot somente leitura
  // - Qualquer outro caso (ao vivo, Em Atualização, rascunho) → pavimentos (estado reativo)
  const pavimentosExibidos: PavComAtiv[] =
    (versaoAtual?.status === 'Definitiva' && !modoRascunho && versaoAtual?.snapshot?.pavimentos)
      ? snapshotParaPavimentos(versaoAtual.snapshot)
      : pavimentos;

  const [modalVersao, setModalVersao] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);
  const [formVersao, setFormVersao] = useState({
    nome: '', descricao: '', status: 'Em Atualização' as 'Definitiva' | 'Em Atualização',
    sobrescreverVersaoId: null as number | null,
    erroNome: '',
  });
  const [salvandoVersao, setSalvandoVersao] = useState(false);

  // ─── Dirty State / Working Copy ───
  const [isDirty, setIsDirty] = useState(false);
  // modoLeitura: bloqueado apenas se Definitiva E não iniciou rascunho
  const modoLeitura = versaoAtual?.status === 'Definitiva' && !modoRascunho;

  const [modalSaida, setModalSaida] = useState<{destino: string | null; tipo: 'navegacao' | 'fechar'} | null>(null);
  const destinoPendente = useRef<string | null>(null);

  // beforeunload — avisa ao fechar aba/janela
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && !modoLeitura) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, modoLeitura]);

  // Interceptar navegação do router (botão Voltar, Dashboard, etc.)
  const navegarComGuarda = (destino: string) => {
    if (isDirty && !modoLeitura) {
      destinoPendente.current = destino;
      setModalSaida({ destino, tipo: 'navegacao' });
    } else {
      router.push(destino);
    }
  };

  // Marcar dirty a cada mutação de estado local
  const marcarDirty = () => { if (!modoLeitura) setIsDirty(true); };
  const limparDirty = () => setIsDirty(false);

  // ─── Working Copy — mutações reativas sem re-fetch ───

  // Atualiza campos de uma atividade em qualquer pavimento
  const atualizarAtividadeLocal = (atId: number, campos: Partial<Atividade>) => {
    // Sempre atualizar o estado reativo de pavimentos — é a fonte de verdade para renderização
    setPavimentos(prev => prev.map(pav => ({
      ...pav,
      atividades: pav.atividades.map(at => at.id === atId ? { ...at, ...campos } : at),
    })));
    marcarDirty();
  };

  // Adiciona atividade a um pavimento
  const adicionarAtividadeLocal = (pavId: number, novaAt: Atividade) => {
    setPavimentos(prev => prev.map(pav =>
      pav.id === pavId ? { ...pav, atividades: [...pav.atividades, novaAt] } : pav
    ));
    marcarDirty();
  };

  // Remove atividade
  const removerAtividadeLocal = (atId: number) => {
    setPavimentos(prev => prev.map(pav => ({
      ...pav,
      atividades: pav.atividades.filter(at => at.id !== atId),
    })));
    marcarDirty();
  };

  // Atualiza subatividades de uma atividade
  const atualizarSubatividadesLocal = (atId: number, novasSubs: Subatividade[]) => {
    const durTotal = novasSubs.reduce((acc, s) => acc + (s.duracao || 0), 0);
    setPavimentos(prev => prev.map(pav => ({
      ...pav,
      atividades: pav.atividades.map(at => {
        if (at.id !== atId) return at;
        const dataFim = durTotal > 0
          ? toStr(addDias(parseDate(at.data_inicio), durTotal - 1))
          : at.data_fim;
        return {
          ...at,
          subatividades: novasSubs.map((s, i) => ({ ...s, cor: getCorSub(at.nome, i) })),
          data_fim: dataFim,
          duracao_dias: durTotal || at.duracao_dias,
        };
      }),
    })));
    marcarDirty();
  };

  // Propaga movimento de cadeia vinculada no estado local
  const propagarVinculoLocal = (vinculoId: string, atOrigemId: number, deltaDias: number) => {
    setPavimentos(prev => {
      // Coletar cadeia ordenada
      const cadeia: Atividade[] = [];
      prev.forEach(pav => pav.atividades.forEach(at => {
        if (at.vinculo_id === vinculoId) cadeia.push(at);
      }));
      cadeia.sort((a, b) => (a.vinculo_ordem ?? 0) - (b.vinculo_ordem ?? 0));

      // Encontrar índice da origem
      const idxOrigem = cadeia.findIndex(a => a.id === atOrigemId);
      if (idxOrigem < 0) return prev;

      // Recalcular datas dos sucessores em dias úteis
      const novasDatas: Record<number, { inicio: string; fim: string }> = {};
      for (let i = idxOrigem; i < cadeia.length; i++) {
        const at = cadeia[i];
        const durUtil = at.duracao_dias ?? diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
        if (i === idxOrigem) {
          const ni = addDiasUteis(parseDate(at.data_inicio), deltaDias, feriadosSet, sabadoUtil, domingoUtil);
          novasDatas[at.id] = { inicio: toStr(ni), fim: toStr(calcDataFimUtil(ni, durUtil)) };
        } else {
          const antFim = parseDate(novasDatas[cadeia[i-1].id].fim);
          const ni = addDiasUteis(antFim, 1, feriadosSet, sabadoUtil, domingoUtil);
          novasDatas[at.id] = { inicio: toStr(ni), fim: toStr(calcDataFimUtil(ni, durUtil)) };
        }
      }

      return prev.map(pav => ({
        ...pav,
        atividades: pav.atividades.map(at =>
          novasDatas[at.id]
            ? { ...at, data_inicio: novasDatas[at.id].inicio, data_fim: novasDatas[at.id].fim }
            : at
        ),
      }));
    });
    marcarDirty();
  };

  // Atualiza numLinhas de um bloco localmente
  const atualizarNumLinhasBloco = (blocoNome: string, novasLinhas: number) => {
    setPavimentos(prev => prev.map(pav =>
      (pav.nome === blocoNome || pav.nome.startsWith(`${blocoNome} - `))
        ? { ...pav, numLinhas: novasLinhas }
        : pav
    ));
    marcarDirty();
  };

  // Tooltip
  const [tooltip, setTooltip] = useState<{at:Atividade;pav:PavComAtiv;x:number;y:number}|null>(null);

  // Hover de vínculo — para desenhar linhas pontilhadas
  const [hoverVinculo, setHoverVinculo] = useState<string | null>(null);
  const graficoRef = useRef<HTMLDivElement>(null); // ref do div interno do gráfico

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
  const [formCriar, setFormCriar] = useState({ nome: '', duracao: '5', equipe: '', efetivo: '' });
  const [subsCriar, setSubsCriar] = useState<{id:string;nome:string;duracao:string;equipe:string;efetivo:string}[]>([]);
  const [usarSubs, setUsarSubs] = useState(false);
  const [replicar, setReplicar] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [pavSelecionados, setPavSelecionados] = useState<number[]>([]);
  const [criando, setCriando] = useState(false);

  // Modal de edição
  const [modalEditar, setModalEditar] = useState<{at: Atividade; pav: PavComAtiv} | null>(null);
  const [formEditar, setFormEditar] = useState({ nome: '', dataInicio: '', dataFim: '', equipe: '', efetivo: '' });
  const [subsEditar, setSubsEditar] = useState<{id:string;dbId?:number;nome:string;duracao:string;equipe:string;efetivo:string}[]>([]);
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

  useEffect(() => { fetchDados(); fetchVersoes(); }, [obraId, supabase]);

  // Fechar menu de contexto ao clicar em qualquer lugar
  useEffect(() => {
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const fetchVersoes = async () => {
    const { data } = await supabase
      .from('versoes').select('*').eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data) {
      setVersoes(data as any[]);
      // Carregar versão definitiva mais recente
      const definitiva = (data as any[]).find(v => v.status === 'Definitiva');
      if (definitiva) setVersaoAtual(definitiva);
      else if (data.length > 0) setVersaoAtual(data[0] as any);
    }
  };

  const fetchDados = async () => {
    try {
      setLoading(true);
      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      // Feriados
      const { data: ferData } = await supabase.from('feriados').select('*').eq('obra_id', obraId);
      setFeriados(ferData || []);

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

          // Buscar subatividades para cada atividade
          const atividades: Atividade[] = await Promise.all(
            (ativData || []).map(async (a) => {
              const { data: subData } = await supabase
                .from('subatividades').select('*')
                .eq('atividade_id', a.id).order('ordem');
              return {
                ...a,
                linha_index: a.linha_index ?? 0,
                vinculo_id: a.vinculo_id ?? null,
                vinculo_ordem: a.vinculo_ordem ?? null,
                subatividades: (subData || []).map((s, i) => ({
                  ...s,
                  cor: getCorSub(a.nome, i),
                })),
              };
            })
          );

          return { ...pav, blocoNome, atividades, numLinhas: numLinhasPorBloco[blocoNome] ?? 1 };
        })
      );
      setPavimentos(pavCompletos);
    } finally { setLoading(false); }
  };

  // ─── Iniciar rascunho a partir de uma versão Definitiva ───
  const iniciarRascunho = () => {
    if (!versaoAtual?.snapshot) return;
    // Clonar o snapshot da Definitiva como base de edição
    setSnapshotBase(JSON.parse(JSON.stringify(versaoAtual.snapshot)));
    setIsDirty(false);
    setMensagem({
      tipo: 'success',
      texto: `✏️ Editando a partir de "${versaoAtual.nome}". Salve como nova versão quando terminar.`,
    });
    setTimeout(() => setMensagem(null), 5000);
  };

  // ─── Helper: calcular data fim em dias úteis usando config da obra ───
  // ─── Helpers de dias úteis (usam ref — sempre valores atuais) ───
  const isDiaUtil = useCallback((data: Date): boolean => {
    const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
    const dia = data.getDay();
    const s = toStr(data);
    return !fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du);
  }, []);

  const calcInicioUtil = useCallback((data: Date): Date => {
    const r = new Date(data);
    while (!(() => {
      const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
      const dia = r.getDay(); const s = toStr(r);
      return !fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du);
    })()) r.setDate(r.getDate() + 1);
    return r;
  }, []);

  const calcDataFimUtil = useCallback((inicio: Date, duracaoDias: number): Date => {
    const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
    // Avançar início para o primeiro dia útil (inclusive)
    const r = new Date(inicio);
    while (true) {
      const dia = r.getDay(); const s = toStr(r);
      if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) break;
      r.setDate(r.getDate() + 1);
    }
    // Contar (duracaoDias - 1) dias úteis adicionais
    let restante = duracaoDias - 1;
    while (restante > 0) {
      r.setDate(r.getDate() + 1);
      const dia = r.getDay(); const s = toStr(r);
      if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) restante--;
    }
    return r;
  }, []);

  const calcProximoInicioUtil = useCallback((fimAnterior: Date): Date => {
    const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
    const r = new Date(fimAnterior);
    r.setDate(r.getDate() + 1);
    while (true) {
      const dia = r.getDay(); const s = toStr(r);
      if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) return r;
      r.setDate(r.getDate() + 1);
    }
  }, []);
  const atualizarSnapshotBaseLocal = (atId: number, campos: Partial<Atividade>) => {
    if (!modoRascunho || !snapshotBase) return;
    const novoSnapshot = JSON.parse(JSON.stringify(snapshotBase));
    novoSnapshot.pavimentos = novoSnapshot.pavimentos.map((pav: any) => ({
      ...pav,
      atividades: pav.atividades.map((at: any) =>
        at.id === atId ? { ...at, ...campos } : at
      ),
    }));
    setSnapshotBase(novoSnapshot);
    marcarDirty();
  };

  // ─── Salvar versão (snapshot do estado atual) ───
  const handleSalvarVersao = async () => {
    const nome = formVersao.nome.trim();
    if (!nome) return;

    // Verificar nome duplicado
    const nomeDuplicado = versoes.find(v =>
      v.nome.toLowerCase() === nome.toLowerCase() && v.id !== formVersao.sobrescreverVersaoId
    );
    if (nomeDuplicado) {
      setFormVersao(p => ({ ...p, erroNome: `Já existe uma versão com o nome "${nome}"` }));
      return;
    }

    // Não pode sobrescrever versão definitiva
    if (formVersao.sobrescreverVersaoId) {
      const alvo = versoes.find(v => v.id === formVersao.sobrescreverVersaoId);
      if (alvo?.status === 'Definitiva') {
        setFormVersao(p => ({ ...p, erroNome: 'Não é possível sobrescrever uma versão Definitiva' }));
        return;
      }
    }

    setSalvandoVersao(true);
    try {
      // Fonte dos dados: snapshotBase (rascunho a partir de Definitiva) > banco ao vivo
      const fonteDados = modoRascunho && snapshotBase
        ? snapshotBase.pavimentos
        : pavimentos.map(pav => ({
            id: pav.id, nome: pav.nome, numero: pav.numero, numLinhas: pav.numLinhas,
            atividades: pav.atividades.map(at => ({
              id: at.id, nome: at.nome, data_inicio: at.data_inicio, data_fim: at.data_fim,
              duracao_dias: at.duracao_dias, equipe: at.equipe,
              efetivo: at.efetivo ?? null,
              linha_index: at.linha_index,
              vinculo_id: at.vinculo_id, vinculo_ordem: at.vinculo_ordem,
              subatividades: at.subatividades,
            })),
          }));

      const snapshot = {
        pavimentos: fonteDados,
        savedAt: new Date().toISOString(),
        baseadoEm: modoRascunho ? versaoAtual?.nome : undefined,
      };

      let versaoSalva: any = null;

      if (formVersao.sobrescreverVersaoId) {
        // Sobrescrever versão Em Atualização existente
        const { data } = await supabase.from('versoes').update({
          nome, descricao: formVersao.descricao.trim() || null,
          status: formVersao.status, snapshot,
        }).eq('id', formVersao.sobrescreverVersaoId).select().single();
        versaoSalva = data;
        setVersoes(prev => prev.map(v => v.id === formVersao.sobrescreverVersaoId ? versaoSalva : v));
      } else {
        // Nova versão
        const { data } = await supabase.from('versoes').insert({
          obra_id: obraId, nome,
          descricao: formVersao.descricao.trim() || null,
          status: formVersao.status, snapshot,
        }).select().single();
        versaoSalva = data;
        if (versaoSalva) setVersoes(prev => [versaoSalva, ...prev]);
      }

      if (versaoSalva) setVersaoAtual(versaoSalva);

      setModalVersao(false);
      setFormVersao({ nome: '', descricao: '', status: 'Em Atualização', sobrescreverVersaoId: null, erroNome: '' });
      limparDirty();
      setSnapshotBase(null); // limpar rascunho após salvar
      setMensagem({ tipo: 'success', texto: `✅ Versão "${nome}" salva!` });
      setTimeout(() => setMensagem(null), 3000);
    } finally { setSalvandoVersao(false); }
  };

  // ─── Atualizar snapshot da versão Em Atualização ativa ───
  const atualizarSnapshotVersaoAtiva = async (pavimentosAtualizados: PavComAtiv[]) => {
    // NUNCA atualizar versões Definitivas — são imutáveis
    if (!versaoAtual || versaoAtual.status !== 'Em Atualização') return;

    const snapshot = {
      pavimentos: pavimentosAtualizados.map(pav => ({
        id: pav.id, nome: pav.nome, numero: pav.numero, numLinhas: pav.numLinhas,
        atividades: pav.atividades.map(at => ({
          id: at.id, nome: at.nome, data_inicio: at.data_inicio, data_fim: at.data_fim,
          duracao_dias: at.duracao_dias, equipe: at.equipe, efetivo: at.efetivo ?? null,
          linha_index: at.linha_index, vinculo_id: at.vinculo_id, vinculo_ordem: at.vinculo_ordem,
          subatividades: at.subatividades,
        })),
      })),
      savedAt: new Date().toISOString(),
    };

    await supabase.from('versoes').update({ snapshot }).eq('id', versaoAtual.id);
    setVersoes(prev => prev.map(v => v.id === versaoAtual.id ? { ...v, snapshot } : v));
    setVersaoAtual(prev => prev ? { ...prev, snapshot } : null);
  };

  // ─── Excluir versão ───
  const handleExcluirVersao = async (versao: Versao) => {
    // Nunca excluir se for a única definitiva
    const definitivas = versoes.filter(v => v.status === 'Definitiva');
    if (versao.status === 'Definitiva' && definitivas.length <= 1) {
      setMensagem({ tipo: 'error', texto: '❌ Não é possível excluir a única versão Definitiva' });
      setTimeout(() => setMensagem(null), 4000);
      return;
    }
    if (!confirm(`Excluir versão "${versao.nome}"?`)) return;

    await supabase.from('versoes').delete().eq('id', versao.id);
    const novasVersoes = versoes.filter(v => v.id !== versao.id);
    setVersoes(novasVersoes);

    // Se era a versão atual, carregar a próxima definitiva
    if (versaoAtual?.id === versao.id) {
      const proxima = novasVersoes.find(v => v.status === 'Definitiva') || novasVersoes[0] || null;
      setVersaoAtual(proxima);
    }

    setMensagem({ tipo: 'success', texto: `✅ Versão "${versao.nome}" excluída` });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Datas mín/máx com zoom ───
  const { dataMin, dataMax, totalDias } = useMemo(() => {
    const todas = pavimentosExibidos.flatMap(p => p.atividades);

    let min: Date, max: Date;
    if (todas.length > 0) {
      const datas = todas.flatMap(a => [parseDate(a.data_inicio), parseDate(a.data_fim)]);
      min = addDias(new Date(Math.min(...datas.map(d => d.getTime()))), -3);
      max = addDias(new Date(Math.max(...datas.map(d => d.getTime()))), 5);
    } else {
      min = obra?.data_inicio ? parseDate(obra.data_inicio) : new Date();
      max = obra?.data_fim ? parseDate(obra.data_fim) : addDias(new Date(), 60);
    }

    // Aplicar zoom
    const zMin = zoomInicio ? parseDate(zoomInicio) : min;
    const zMax = zoomFim ? parseDate(zoomFim) : max;
    return { dataMin: zMin, dataMax: zMax, totalDias: Math.max(7, diffDias(zMin, zMax)) };
  }, [pavimentosExibidos, obra, zoomInicio, zoomFim]);

  // ─── Dias do calendário (um por coluna) ───
  const diasCalendario = useMemo(() => {
    const dias: Date[] = [];
    const atual = new Date(dataMin);
    for (let i = 0; i <= totalDias; i++) {
      dias.push(new Date(atual));
      atual.setDate(atual.getDate() + 1);
    }
    return dias;
  }, [dataMin, totalDias]);

  // Marcadores de semana para linha de tempo
  const marcadores = useMemo(() => {
    const step = totalDias <= 30 ? 1 : totalDias <= 90 ? 7 : totalDias <= 180 ? 14 : 30;
    const result = [];
    for (let i = 0; i <= totalDias; i += step) {
      result.push({
        dia: i,
        label: addDias(dataMin, i).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        data: addDias(dataMin, i),
      });
    }
    return result;
  }, [dataMin, totalDias]);

  const ppd = useCallback(() => {
    if (!containerRef.current) return 10;
    return (containerRef.current.offsetWidth - LARGURA_NOME) / totalDias;
  }, [totalDias]);

  // ─── Calcular posições das atividades vinculadas para o SVG ───
  // ─── Conflitos ───
  // ─── Pavimentos filtrados para exibição ───
  const pavimentosFiltrados = useMemo(() => {
    if (pavimentosFiltro.size === 0) return pavimentosExibidos;
    return pavimentosExibidos.filter(p => pavimentosFiltro.has(p.id));
  }, [pavimentosExibidos, pavimentosFiltro]);

  // ─── Imprimir / Exportar PDF ───
  const handleImprimir = () => {
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('Permita popups para imprimir'); return; }

    const pxPorDia = totalDias <= 30 ? 44 : totalDias <= 60 ? 30 : totalDias <= 120 ? 20 : 12;
    const larguraGrafico = Math.max(LARGURA_NOME + totalDias * pxPorDia, 1000);
    const ALTURA = ALTURA_LINHA;

    // Gerar linhas do eixo X
    const eixoX = diasCalendario.map((dia, i) => {
      const pct = (i / totalDias) * 100;
      const larg = (1 / totalDias) * 100;
      const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil) || 'transparent';
      const isDom = dia.getDay() === 0;
      const isSab = dia.getDay() === 6;
      const isFer = feriadosSet.has(toStr(dia));
      const cor = isFer ? '#ef4444' : isDom ? '#6366f1' : isSab ? '#a5b4fc' : '#94a3b8';
      return `<div style="position:absolute;left:${pct}%;width:${larg}%;top:0;bottom:0;background:${bgCor};border-left:1px solid rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:9px;font-weight:700;color:${cor};line-height:1">${LABEL_DIA[dia.getDay()]}</span>
        <span style="font-size:9px;color:#94a3b8;line-height:1;margin-top:1px">${dia.getDate()}</span>
      </div>`;
    }).join('');

    // Gerar linhas dos pavimentos
    const linhasPav = pavimentosFiltrados.map((pav, pavIdx) => {
      const altTotal = pav.numLinhas * ALTURA;
      const bg = pavIdx % 2 === 0 ? '#ffffff' : '#f8fafc';

      // Grade de fundo
      const grade = diasCalendario.map((dia, i) => {
        const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
        return bgCor ? `<div style="position:absolute;left:${(i/totalDias)*100}%;width:${(1/totalDias)*100}%;top:0;bottom:0;background:${bgCor}"></div>` : '';
      }).join('');

      // Separadores de linhas
      const seps = Array.from({ length: pav.numLinhas - 1 }, (_, i) =>
        `<div style="position:absolute;left:0;right:0;top:${(i+1)*ALTURA}px;border-top:1px dashed #e2e8f0"></div>`
      ).join('');

      // Barras de atividades
      const barras = pav.atividades.map(at => {
        const dispDia = diffDias(dataMin, parseDate(at.data_inicio));
        const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
        const leftPct = Math.max(0, (dispDia / totalDias) * 100);
        const rightPct = Math.min(100, ((dispDia + dur) / totalDias) * 100);
        const widthPct = rightPct - leftPct;
        if (widthPct <= 0) return '';
        const cor = getCor(at.nome);
        const linhaAt = at.linha_index ?? 0;
        const top = linhaAt * ALTURA + 4;
        const height = ALTURA - 8;

        // Subatividades
        const subHtml = (at.subatividades?.length ?? 0) > 0 ? (() => {
          const durT = at.subatividades!.reduce((a, b) => a + (b.duracao || 0), 0);
          const segs = at.subatividades!.map((s, i) =>
            `<div style="height:100%;width:${(s.duracao/durT)*100}%;background:${s.cor||getCorSub(at.nome,i)};${i>0?'border-left:1px solid rgba(255,255,255,0.4)':''}"></div>`
          ).join('');
          return `<div style="position:absolute;bottom:0;left:0;right:0;height:40%;display:flex">${segs}</div>`;
        })() : '';

        return `<div style="position:absolute;left:${leftPct}%;width:${widthPct}%;top:${top}px;height:${height}px;background:${cor};border-radius:4px;overflow:hidden;min-width:4px;">
          <div style="position:absolute;top:0;left:0;right:0;bottom:40%;display:flex;align-items:center;padding:0 6px;">
            <span style="color:white;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,0.3)">${at.nome}</span>
          </div>
          ${subHtml}
        </div>`;
      }).join('');

      const nomeSufixo = pav.nome.includes(' - ') ? pav.nome.split(' - ').slice(1).join(' - ') : pav.nome;

      return `<div style="display:flex;border-bottom:1px solid #f1f5f9;height:${altTotal}px;background:${bg}">
        <div style="width:${LARGURA_NOME}px;min-width:${LARGURA_NOME}px;border-right:1px solid #e2e8f0;padding:4px 12px;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:11px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nomeSufixo}</div>
          ${pav.numero !== null ? `<div style="font-size:10px;color:#94a3b8">Nº ${pav.numero}</div>` : ''}
        </div>
        <div style="flex:1;position:relative;overflow:hidden">
          ${grade}${seps}${barras}
        </div>
      </div>`;
    }).join('');

    // Legenda de cores
    const legendaHtml = Object.entries(coresCache).map(([nome, cor]) =>
      `<div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;border-radius:3px;background:${cor}"></div><span style="font-size:11px;color:#475569">${nome}</span></div>`
    ).join('');

    win.document.write(`<!DOCTYPE html><html><head>
      <title>${obra?.nome} — Linha de Balanço</title>
      <style>
        body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff}
        h1{font-size:18px;font-weight:700;color:#0f172a;margin:0 0 2px}
        .info{font-size:11px;color:#64748b;margin:0 0 10px}
        .legenda{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;padding:8px 12px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
        .grafico{border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
        .eixoX{display:flex;border-bottom:1px solid #e2e8f0;background:#f8fafc;height:40px}
        .nomeCol{width:${LARGURA_NOME}px;min-width:${LARGURA_NOME}px;border-right:1px solid #e2e8f0;padding:0 12px;display:flex;align-items:center}
        .nomeCol span{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
        .diasArea{flex:1;position:relative;overflow:hidden}
        @media print{body{padding:4px}@page{size:A3 landscape;margin:6mm}}
      </style>
    </head><body>
      <h1>${obra?.nome} — Linha de Balanço</h1>
      <p class="info">📅 ${dataMin.toLocaleDateString('pt-BR')} → ${addDias(dataMin, totalDias).toLocaleDateString('pt-BR')} &nbsp;|&nbsp; ${totalDias} dias úteis &nbsp;|&nbsp; ${pavimentosFiltrados.length} pavimentos &nbsp;|&nbsp; ${totalAtividades} atividades</p>
      <div class="legenda">${legendaHtml}</div>
      <div class="grafico" style="width:${larguraGrafico}px">
        <div class="eixoX">
          <div class="nomeCol"><span>Pavimento</span></div>
          <div class="diasArea" style="height:40px">${eixoX}</div>
        </div>
        ${linhasPav}
      </div>
    </body></html>`);

    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const conflitos = useMemo(() => {
    const set = new Set<number>();
    const motivoConflito: Record<number, string> = {};

    // Montar lista com pavIdx para comparar linha absoluta no gráfico
    const todas = pavimentosExibidos.flatMap((p, pavIdx) =>
      p.atividades.map(a => ({
        ...a,
        pavId: p.id,         // ID real do pavimento pai (de p, não de a)
        pavNome: p.nome,
        pavIdx,              // posição no gráfico
      }))
    );

    for (let i = 0; i < todas.length; i++) {
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i], b = todas[j];
        const overlap = parseDate(a.data_inicio) <= parseDate(b.data_fim)
                     && parseDate(a.data_fim)    >= parseDate(b.data_inicio);
        if (!overlap) continue;

        // Conflito 1: mesma equipe, pavimentos diferentes
        if (a.equipe && b.equipe && a.equipe === b.equipe && a.pavId !== b.pavId) {
          set.add(a.id); set.add(b.id);
          motivoConflito[a.id] = `Equipe "${a.equipe}" também em ${b.pavNome}`;
          motivoConflito[b.id] = `Equipe "${b.equipe}" também em ${a.pavNome}`;
        }

        // Conflito 2: mesmo pavimento (mesmo pavIdx) E mesma linha no gráfico
        if (a.pavIdx === b.pavIdx && (a.linha_index ?? 0) === (b.linha_index ?? 0)) {
          set.add(a.id); set.add(b.id);
          motivoConflito[a.id] = `Sobrepõe "${b.nome}" na mesma linha`;
          motivoConflito[b.id] = `Sobrepõe "${a.nome}" na mesma linha`;
        }
      }
    }
    return { set, motivoConflito };
  }, [pavimentosExibidos]);

  // ─── Drag ───
  const handleMouseDown = (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
    if (e.button !== 0) return;
    if (modoLeitura) {
      setMensagem({ tipo: 'error', texto: '🔒 Versão Definitiva é somente leitura. Crie ou selecione uma versão "Em Atualização".' });
      setTimeout(() => setMensagem(null), 4000);
      return;
    }
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
      // Preview: novo início em dias corridos, fim recalculado em dias úteis
      const ni = addDias(parseDate(drag.at.data_inicio), d);
      const duracaoUtil = drag.at.duracao_dias ?? (diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim)) + 1);
      const nf = calcDataFimUtil(ni, duracaoUtil);
      setTooltip({ at: { ...drag.at, data_inicio: toStr(ni), data_fim: toStr(nf), linha_index: drag.startLinha + dl }, pav: drag.pav, x: e.clientX, y: e.clientY });
    };

    const onUp = async (e: MouseEvent) => {
      if (!drag) return;
      const deltaDias = Math.round((e.clientX - drag.startX) / ppd());
      const novaLinha = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + Math.round((e.clientY - drag.startY) / ALTURA_LINHA)));

      if (Math.abs(deltaDias) < 1 && novaLinha === drag.startLinha) { setDrag(null); setTooltip(null); return; }

      // Bloquear persistência se modo leitura — reverter para posição original
      if (modoLeitura) {
        setDrag(null); setTooltip(null);
        return;
      }

      setAtualizando(true);
      // Mover o início pela quantidade de dias arrastados (corridos — o usuário escolhe onde quer)
      const novoInicio = addDias(parseDate(drag.at.data_inicio), deltaDias);
      // Recalcular o fim preservando a duração em dias úteis original
      const duracaoUtil = drag.at.duracao_dias ?? (diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim)) + 1);
      const novoFim = calcDataFimUtil(novoInicio, duracaoUtil);

      // Atualizar local imediatamente
      atualizarAtividadeLocal(drag.at.id, {
        data_inicio: toStr(novoInicio),
        data_fim: toStr(novoFim),
        linha_index: novaLinha,
      });

      // Se tem vínculo e movimento horizontal, propagar cadeia localmente
      if (drag.at.vinculo_id && deltaDias !== 0) {
        propagarVinculoLocal(drag.at.vinculo_id, drag.at.id, deltaDias);
        // Salvar no banco em background (toda a cadeia)
        await propagarVinculo(drag.at, deltaDias, novaLinha, novoInicio, novoFim);
      } else {
        await supabase.from('atividades').update({
          data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha,
        }).eq('id', drag.at.id);
      }

      // Atualizar snapshot da versão Em Atualização
      const pavAtualizados = pavimentos.map(pav => ({
        ...pav,
        atividades: pav.atividades.map(at =>
          at.id === drag.at.id
            ? { ...at, data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha }
            : at
        ),
      }));
      await atualizarSnapshotVersaoAtiva(pavAtualizados);

      setMensagem({ tipo: 'success', texto: `✅ ${drag.at.nome} movida` });
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

    // Recalcular as datas dos sucessores em cascata com dias úteis
    let refFim = novoFim;
    for (const item of cadeia) {
      if (item.id === atOrigem.id) continue;
      if ((item.vinculo_ordem ?? 0) <= (atOrigem.vinculo_ordem ?? 0)) continue;

      const durUtil = item.duracao_dias ?? (diffDias(parseDate(item.data_inicio), parseDate(item.data_fim)) + 1);
      const novaData = addDiasUteis(refFim, 1, feriadosSet, sabadoUtil, domingoUtil);
      const novaDataFim = calcDataFimUtil(novaData, durUtil);

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
    if (modoLeitura) {
      setMensagem({ tipo: 'error', texto: '🔒 Versão Definitiva é somente leitura.' });
      setTimeout(() => setMensagem(null), 3000);
      return;
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, tipo: 'vazio', pav, diaClicado, linhaClicada });
  };

  const handleContextMenuAt = (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
    e.preventDefault();
    e.stopPropagation();
    if (modoLeitura) {
      setMensagem({ tipo: 'error', texto: '🔒 Versão Definitiva é somente leitura.' });
      setTimeout(() => setMensagem(null), 3000);
      return;
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, tipo: 'atividade', at, pav });
  };

  // ─── Abrir modal de criar ───
  const abrirCriar = () => {
    if (!ctxMenu?.pav || ctxMenu.diaClicado === undefined) return;
    const dataInicio = toStr(addDias(dataMin, ctxMenu.diaClicado));
    setModalCriar({ pav: ctxMenu.pav, dataInicio, linha: ctxMenu.linhaClicada ?? 0 });
    setFormCriar({ nome: '', duracao: '5', equipe: '', efetivo: '' });
    setSubsCriar([]);
    setUsarSubs(false);
    setReplicar(false); setVincular(false); setPavSelecionados([]);
    setCtxMenu(null);
  };

  // ─── Pavimentos do mesmo bloco (para replicar/vincular) ───
  const pavimentosDoBloco = useMemo(() => {
    if (!modalCriar) return [];
    return pavimentosExibidos.filter(p =>
      p.blocoNome === modalCriar.pav.blocoNome && p.id !== modalCriar.pav.id
    );
  }, [modalCriar, pavimentosExibidos]);

  // ─── Criar atividade(s) ───
  const handleCriar = async () => {
    if (!modalCriar || !formCriar.nome.trim()) return;
    setCriando(true);

    // Duração: soma das subs ou campo manual
    const duracaoTotal = usarSubs && subsCriar.length > 0
      ? calcDuracaoTotal(subsCriar.map(s => ({ duracao: parseInt(s.duracao) || 0 })))
      : parseInt(formCriar.duracao) || 1;

    const vinculoId = (replicar && vincular && pavSelecionados.length > 0) ? gerarUUID() : null;

    const pavParaCriar: PavComAtiv[] = [modalCriar.pav];
    if (replicar && pavSelecionados.length > 0) {
      pavSelecionados.forEach(id => { const p = pavimentos.find(p => p.id === id); if (p) pavParaCriar.push(p); });
    }
    pavParaCriar.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));

    let dataInicioAtual = calcInicioUtil(parseDate(modalCriar.dataInicio));
    let ordem = 0;

    for (const pav of pavParaCriar) {
      // Data fim considera apenas dias úteis
      const dataFim = calcDataFimUtil(dataInicioAtual, duracaoTotal);
      const { data: novaAt } = await supabase.from('atividades').insert({
        pavimento_id: pav.id,
        nome: formCriar.nome.trim(),
        data_inicio: toStr(dataInicioAtual),
        data_fim: toStr(dataFim),
        duracao_dias: duracaoTotal,
        equipe: formCriar.equipe.trim() || null,
        efetivo: (!usarSubs && formCriar.efetivo) ? parseInt(formCriar.efetivo) : null,
        linha_index: modalCriar.linha,
        vinculo_id: vinculoId,
        vinculo_ordem: vinculoId ? ordem++ : null,
      }).select().single();

      // Salvar subatividades com datas calculadas em dias úteis
      if (novaAt && usarSubs && subsCriar.length > 0) {
        let dataSubInicio = new Date(dataInicioAtual);
        for (let i = 0; i < subsCriar.length; i++) {
          const s = subsCriar[i];
          const durSub = parseInt(s.duracao) || 1;
          const dataSubFim = calcDataFimUtil(dataSubInicio, durSub);
          await supabase.from('subatividades').insert({
            atividade_id: novaAt.id,
            nome: s.nome.trim(),
            duracao: durSub,
            equipe: s.equipe.trim() || null,
            efetivo: s.efetivo ? parseInt(s.efetivo) : null,
            ordem: i,
          });
          // Próxima sub começa no próximo dia útil
          dataSubInicio = calcProximoInicioUtil(dataSubFim);
        }
      }

      // Cascata: próximo pavimento começa no próximo dia útil após o fim
      if (vincular && vinculoId) { dataInicioAtual = calcProximoInicioUtil(dataFim); }
    }

    setModalCriar(null);
    setCriando(false);

    // Re-fetch para pegar IDs reais do banco e subatividades
    await fetchDados();
    setMensagem({ tipo: 'success', texto: `✅ ${pavParaCriar.length} atividade(s) criada(s)!` });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Abrir modal de editar ───
  const abrirEditar = () => {
    if (!ctxMenu?.at || !ctxMenu.pav) return;
    const at = ctxMenu.at;
    setModalEditar({ at, pav: ctxMenu.pav });
    setFormEditar({ nome: at.nome, dataInicio: at.data_inicio, dataFim: at.data_fim, equipe: at.equipe || '', efetivo: at.efetivo ? String(at.efetivo) : '' });
    setSubsEditar((at.subatividades || []).map(s => ({
      id: String(s.id), dbId: s.id,
      nome: s.nome, duracao: String(s.duracao),
      equipe: s.equipe || '', efetivo: s.efetivo ? String(s.efetivo) : '',
    })));
    setCtxMenu(null);
  };

  // ─── Salvar edição ───
  const handleSalvarEdicao = async () => {
    if (!modalEditar) return;
    setSalvandoEdicao(true);

    // Duração: somatório das subs em dias úteis, senão pelo formulário
    let duracao: number;
    let dataFim: string;

    if (subsEditar.length > 0) {
      duracao = calcDuracaoTotal(subsEditar.map(s => ({ duracao: parseInt(s.duracao) || 0 })));
      // data fim = início + duração em dias úteis
      dataFim = toStr(calcDataFimUtil(parseDate(formEditar.dataInicio), duracao));
    } else {
      // Se usuário editou manualmente as datas, respeitar
      // Mas recalcular duração em dias úteis
      duracao = (() => {
        let count = 0;
        const ini = parseDate(formEditar.dataInicio);
        const fim = parseDate(formEditar.dataFim);
        const cur = new Date(ini);
        while (cur <= fim) {
          if (addDiasUteis(cur, 0, feriadosSet, sabadoUtil, domingoUtil) === cur || true) {
            const dia = cur.getDay();
            const s = toStr(cur);
            if (!feriadosSet.has(s) && !(dia === 6 && !sabadoUtil) && !(dia === 0 && !domingoUtil)) count++;
          }
          cur.setDate(cur.getDate() + 1);
        }
        return count || 1;
      })();
      dataFim = formEditar.dataFim;
    }

    await supabase.from('atividades').update({
      nome: formEditar.nome,
      data_inicio: formEditar.dataInicio,
      data_fim: dataFim,
      duracao_dias: duracao,
      equipe: formEditar.equipe || null,
      efetivo: (subsEditar.length === 0 && formEditar.efetivo) ? parseInt(formEditar.efetivo) : null,
    }).eq('id', modalEditar.at.id);

    // Gerenciar subatividades
    const dbIds = subsEditar.filter(s => s.dbId).map(s => s.dbId!);

    // Deletar as que foram removidas
    const idsAntigos = (modalEditar.at.subatividades || []).map(s => s.id);
    const removidos = idsAntigos.filter(id => !dbIds.includes(id));
    if (removidos.length > 0) {
      await supabase.from('subatividades').delete().in('id', removidos);
    }

    // Upsert as existentes e inserir novas
    for (let i = 0; i < subsEditar.length; i++) {
      const s = subsEditar[i];
      if (s.dbId) {
        await supabase.from('subatividades').update({
          nome: s.nome, duracao: parseInt(s.duracao) || 1,
          equipe: s.equipe || null, efetivo: s.efetivo ? parseInt(s.efetivo) : null, ordem: i,
        }).eq('id', s.dbId);
      } else {
        await supabase.from('subatividades').insert({
          atividade_id: modalEditar.at.id, nome: s.nome,
          duracao: parseInt(s.duracao) || 1, equipe: s.equipe || null,
          efetivo: s.efetivo ? parseInt(s.efetivo) : null, ordem: i,
        });
      }
    }

    // Atualizar localmente — incluindo subatividades recalculadas
    const subsAtualizadas: Subatividade[] = subsEditar.map((s, i) => ({
      id: s.dbId ?? Date.now() + i, // ID temporário para novas
      atividade_id: modalEditar.at.id,
      nome: s.nome,
      duracao: parseInt(s.duracao) || 1,
      equipe: s.equipe || null,
      efetivo: s.efetivo ? parseInt(s.efetivo) : null,
      ordem: i,
    }));

    const efeitoLocal: Partial<Atividade> = {
      nome: formEditar.nome,
      data_inicio: formEditar.dataInicio,
      data_fim: dataFim,
      duracao_dias: duracao,
      equipe: formEditar.equipe || null,
      efetivo: (subsEditar.length === 0 && formEditar.efetivo) ? parseInt(formEditar.efetivo) : null,
      subatividades: subsAtualizadas.map((s, i) => ({ ...s, cor: getCorSub(formEditar.nome, i) })),
    };
    atualizarAtividadeLocal(modalEditar.at.id, efeitoLocal);

    setModalEditar(null);
    setSalvandoEdicao(false);

    // Atualizar snapshot da versão Em Atualização
    const pavAtualizados = pavimentos.map(pav => ({
      ...pav,
      atividades: pav.atividades.map(at =>
        at.id === modalEditar.at.id ? { ...at, ...efeitoLocal } : at
      ),
    }));
    await atualizarSnapshotVersaoAtiva(pavAtualizados);

    setMensagem({ tipo: 'success', texto: '✅ Atividade atualizada!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Excluir atividade ───
  const handleExcluirAtividade = async () => {
    if (!modalEditar) return;
    if (!confirm(`Excluir "${modalEditar.at.nome}"?`)) return;
    setExcluindoAt(true);
    await supabase.from('atividades').delete().eq('id', modalEditar.at.id);
    // Remover do estado local imediatamente
    removerAtividadeLocal(modalEditar.at.id);
    setModalEditar(null);
    setExcluindoAt(false);
    setMensagem({ tipo: 'success', texto: '✅ Atividade excluída!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Quebrar vínculo ───
  const handleQuebrarVinculo = async () => {
    if (!modalEditar?.at.vinculo_id) return;
    await supabase.from('atividades').update({ vinculo_id: null, vinculo_ordem: null }).eq('id', modalEditar.at.id);
    // Atualizar local
    atualizarAtividadeLocal(modalEditar.at.id, { vinculo_id: null, vinculo_ordem: null });
    setModalEditar(prev => prev ? { ...prev, at: { ...prev.at, vinculo_id: null, vinculo_ordem: null } } : null);
    setMensagem({ tipo: 'success', texto: '✅ Vínculo quebrado!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Reativar vínculo ───
  const [modalVincular, setModalVincular] = useState<{at: Atividade} | null>(null);

  const handleReativarVinculo = async (atAlvo: Atividade) => {
    if (!modalEditar) return;
    const novoVinculoId = gerarUUID();
    const atA = modalEditar.at;
    const [primeiro, segundo] = parseDate(atA.data_fim) <= parseDate(atAlvo.data_inicio) ? [atA, atAlvo] : [atAlvo, atA];

    await supabase.from('atividades').update({ vinculo_id: novoVinculoId, vinculo_ordem: 0 }).eq('id', primeiro.id);
    await supabase.from('atividades').update({ vinculo_id: novoVinculoId, vinculo_ordem: 1 }).eq('id', segundo.id);

    // Atualizar local
    atualizarAtividadeLocal(primeiro.id, { vinculo_id: novoVinculoId, vinculo_ordem: 0 });
    atualizarAtividadeLocal(segundo.id, { vinculo_id: novoVinculoId, vinculo_ordem: 1 });

    setModalVincular(null);
    setModalEditar(null);
    setMensagem({ tipo: 'success', texto: '✅ Vínculo reativado!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Editar linhas do bloco ───
  const calcularConflitosReducao = (blocoNome: string, novasLinhas: number) => {
    return pavimentosExibidos
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

    // Atualizar banco em background
    const { data: pavData } = await supabase.from('pavimentos').select('*').eq('obra_id', obraId);
    const doBloco = (pavData || []).filter(p => p.nome === editandoBloco.blocoNome || p.nome.startsWith(`${editandoBloco.blocoNome} - `));
    const primeiro = doBloco.find(p => p.observacao?.startsWith(PREFIXO_META));
    const alvo = primeiro || doBloco[0];
    if (alvo) {
      const meta = parseMeta(alvo.observacao);
      await supabase.from('pavimentos').update({ observacao: buildMeta(meta.tipo, meta.observacao, novasLinhas) }).eq('id', alvo.id);
    }

    // Atualizar estado local imediatamente
    atualizarNumLinhasBloco(editandoBloco.blocoNome, novasLinhas);

    setEditandoBloco(null);
    setSalvandoLinhas(false);
    setMensagem({ tipo: 'success', texto: `✅ Linhas atualizadas para ${novasLinhas}` });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Atividades vinculadas (para destaque) ───
  const atividadesVinculadas = useMemo(() => {
    const map: Record<string, number[]> = {};
    pavimentosExibidos.forEach(p => p.atividades.forEach(a => {
      if (a.vinculo_id) { if (!map[a.vinculo_id]) map[a.vinculo_id] = []; map[a.vinculo_id].push(a.id); }
    }));
    return map;
  }, [pavimentosExibidos]);

  const totalAtividades = pavimentosExibidos.reduce((acc, p) => acc + p.atividades.length, 0);

  // ─── Linhas de vínculo para SVG (depende de pavimentosExibidos, dataMin, totalDias) ───
  const linhasVinculo = useMemo(() => {
    if (!hoverVinculo) return [];

    const itens: {
      at: Atividade; pav: PavComAtiv;
      pavIdx: number; centroX: number; centroY: number;
    }[] = [];

    pavimentosExibidos.forEach((pav, pavIdx) => {
      pav.atividades.forEach(at => {
        if (at.vinculo_id !== hoverVinculo) return;

        const startDia = diffDias(dataMin, parseDate(at.data_inicio));
        const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
        const linhaAt = at.linha_index ?? 0;

        const centroX = (startDia + dur / 2) / totalDias;
        let offsetY = 32;
        for (let i = 0; i < pavIdx; i++) {
          offsetY += pavimentosExibidos[i].numLinhas * ALTURA_LINHA;
        }
        offsetY += linhaAt * ALTURA_LINHA + ALTURA_LINHA / 2;

        itens.push({ at, pav, pavIdx, centroX, centroY: offsetY });
      });
    });

    itens.sort((a, b) => (a.at.vinculo_ordem ?? 0) - (b.at.vinculo_ordem ?? 0));

    const linhas: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < itens.length - 1; i++) {
      linhas.push({
        x1: itens[i].centroX, y1: itens[i].centroY,
        x2: itens[i + 1].centroX, y2: itens[i + 1].centroY,
      });
    }

    return linhas;
  }, [hoverVinculo, pavimentosExibidos, dataMin, totalDias]);

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
            <button onClick={() => navegarComGuarda(`/obras/${obraId}`)} className="text-blue-600 hover:text-blue-700 font-semibold">← Voltar</button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white">📊</span></div>
              <div><h1 className="text-xl font-bold text-slate-900">Linha de Balanço</h1><p className="text-sm text-slate-500">{obra?.nome}</p></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Versão atual */}
            {versaoAtual && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  modoRascunho
                    ? 'bg-blue-100 border border-blue-300 hover:bg-blue-200'
                    : modoLeitura
                      ? 'bg-green-100 border border-green-300 hover:bg-green-200'
                      : isDirty
                        ? 'bg-yellow-100 border border-yellow-300 hover:bg-yellow-200'
                        : 'bg-slate-100 hover:bg-slate-200'
                }`}
                onClick={() => setModalHistorico(true)}
              >
                <span className={`w-2 h-2 rounded-full ${
                  modoRascunho ? 'bg-blue-500' :
                  versaoAtual.status === 'Definitiva' ? 'bg-green-500' : 'bg-yellow-500'
                }`}></span>
                <span className={`text-xs font-semibold ${
                  modoRascunho ? 'text-blue-800' :
                  modoLeitura ? 'text-green-800' : 'text-slate-700'
                }`}>
                  {modoRascunho ? '✏️' : modoLeitura ? '🔒' : isDirty ? '●' : ''} {versaoAtual.nome}
                </span>
                {modoRascunho && <span className="text-xs text-blue-600 font-bold">RASCUNHO</span>}
                {modoLeitura && <span className="text-xs text-green-600 font-bold">LEITURA</span>}
                {isDirty && !modoLeitura && !modoRascunho && <span className="text-xs text-yellow-700 font-bold">NÃO SALVO</span>}
                <span className="text-xs text-slate-400">▼</span>
              </div>
            )}

            {/* Botão salvar versão */}
            <button
              onClick={() => setModalVersao(true)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
            >
              💾 Salvar Versão
            </button>

            {/* Botão Dashboard */}
            <button
              onClick={() => navegarComGuarda(`/obras/${obraId}/dashboard`)}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              📋 Dashboard
            </button>

            {/* Stats */}
            <div className="flex items-center gap-4 ml-2 pl-4 border-l border-slate-200">
              {[{ v: pavimentos.length, l: 'Pavimentos', c: 'blue' }, { v: totalAtividades, l: 'Atividades', c: 'green' }, { v: totalDias, l: 'Dias', c: 'orange' }].map(({ v, l, c }) => (
                <div key={l} className="text-center">
                  <p className={`text-xl font-bold text-${c}-600`}>{v}</p>
                  <p className="text-xs text-slate-500">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full px-6 py-6">
        {/* Banner modo leitura */}
        {modoLeitura && (
          <div className="mb-4 p-4 rounded-lg border-2 border-green-300 bg-green-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-bold text-green-900">Versão Definitiva — Somente Leitura</p>
                <p className="text-sm text-green-700">Esta versão está protegida. Edite como rascunho ou selecione outra versão.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={iniciarRascunho}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
              >
                ✏️ Editar como Rascunho
              </button>
              <button
                onClick={() => setModalHistorico(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold"
              >
                Trocar Versão
              </button>
            </div>
          </div>
        )}

        {/* Banner modo rascunho */}
        {modoRascunho && (
          <div className="mb-4 p-4 rounded-lg border-2 border-blue-300 bg-blue-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <div>
                <p className="font-bold text-blue-900">Rascunho — baseado em "{versaoAtual?.nome}"</p>
                <p className="text-sm text-blue-700">Suas edições estão em modo temporário. Salve como nova versão para preservar.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setModalVersao(true); }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold"
              >
                💾 Salvar como Nova Versão
              </button>
              <button
                onClick={() => {
                  if (isDirty && !confirm('Descartar edições do rascunho?')) return;
                  setSnapshotBase(null);
                  limparDirty();
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold"
              >
                ✕ Descartar
              </button>
            </div>
          </div>
        )}

        {mensagem && (
          <div className={`mb-4 p-4 rounded-lg border font-medium ${mensagem.tipo === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {mensagem.texto}
          </div>
        )}

        {/* Filtro de Zoom + Legenda Calendário */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">🔍 Zoom:</span>
            <input type="date" value={zoomInicio} onChange={e => setZoomInicio(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded text-sm text-slate-900 outline-none focus:ring-1 focus:ring-blue-500" />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" value={zoomFim} onChange={e => setZoomFim(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded text-sm text-slate-900 outline-none focus:ring-1 focus:ring-blue-500" />
            {(zoomInicio || zoomFim) && (
              <button onClick={() => { setZoomInicio(''); setZoomFim(''); }}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-semibold">✕</button>
            )}
          </div>

          {/* Filtro de pavimentos */}
          <button onClick={() => setModalFiltros(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              pavimentosFiltro.size > 0
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}>
            🏢 Pavimentos {pavimentosFiltro.size > 0 ? `(${pavimentosFiltro.size}/${pavimentosExibidos.length})` : '(todos)'}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Legenda */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.06)' }}></div><span>Sáb</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}></div><span>Dom</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}></div><span>Feriado</span></div>
            </div>

            {/* Imprimir */}
            <button onClick={handleImprimir}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 flex items-center gap-1">
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>

        {/* Gráfico */}
        <div id="grafico-print" className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" ref={containerRef}>
          <div className="p-3 border-b border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
            <span>📅 {dataMin.toLocaleDateString('pt-BR')} — {addDias(dataMin, totalDias).toLocaleDateString('pt-BR')} &nbsp;|&nbsp; Botão direito para criar ou editar atividades</span>
            <div className="flex items-center gap-2">
              {pavimentosFiltro.size > 0 && <span className="text-blue-600 font-medium">🏢 {pavimentosFiltro.size} pavimento(s)</span>}
              {/* Botão Tela Cheia */}
              <button
                onClick={() => setTelaCheia(true)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center gap-1"
              >
                ⛶ Tela Cheia
              </button>
              {/* Botão Imprimir */}
              <button
                onClick={handleImprimir}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold border border-slate-300 flex items-center gap-1"
              >
                🖨️ Imprimir / PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* Largura: LARGURA_NOME + (36px por dia mínimo, 24px máximo para períodos longos) */}
            {(() => {
              const pxPorDia = totalDias <= 30 ? 40 : totalDias <= 60 ? 28 : totalDias <= 120 ? 18 : 10;
              const larguraTotal = LARGURA_NOME + totalDias * pxPorDia;
              return (
            <div ref={graficoRef} style={{ width: `${Math.max(larguraTotal, 900)}px`, position: 'relative' }}>

              {/* SVG overlay para linhas de vínculo */}
              {hoverVinculo && linhasVinculo.length > 0 && graficoRef.current && (
                <svg
                  className="absolute inset-0 pointer-events-none z-30"
                  style={{ width: '100%', height: graficoRef.current.scrollHeight || '100%' }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <marker id="arrowVinculo" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill="rgba(139,92,246,0.8)" />
                    </marker>
                  </defs>
                  {linhasVinculo.map((l, i) => {
                    const totalW = graficoRef.current!.offsetWidth;
                    // Clampar X entre LARGURA_NOME e totalW
                    const areaW = totalW - LARGURA_NOME;
                    const x1 = LARGURA_NOME + Math.max(0, Math.min(1, l.x1)) * areaW;
                    const x2 = LARGURA_NOME + Math.max(0, Math.min(1, l.x2)) * areaW;
                    const y1 = l.y1;
                    const y2 = l.y2;

                    // Se ambos os pontos estão fora da área visível, não renderizar
                    if (x1 <= LARGURA_NOME && x2 <= LARGURA_NOME) return null;
                    if (x1 >= totalW && x2 >= totalW) return null;

                    const mx = (x1 + x2) / 2;

                    return (
                      <g key={i}>
                        {/* Sombra/glow */}
                        <path
                          d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="rgba(139,92,246,0.15)"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                        {/* Linha principal pontilhada */}
                        <path
                          d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="rgba(139,92,246,0.75)"
                          strokeWidth="2"
                          strokeDasharray="8 5"
                          strokeLinecap="round"
                          markerEnd="url(#arrowVinculo)"
                        />
                        {/* Ponto de origem */}
                        <circle cx={x1} cy={y1} r={4} fill="rgba(139,92,246,0.9)" />
                        {/* Ponto de destino */}
                        <circle cx={x2} cy={y2} r={4} fill="rgba(139,92,246,0.9)" />
                      </g>
                    );
                  })}
                </svg>
              )}
              {/* Eixo X — cabeçalho com dias */}
              <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 44 }}>
                <div style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }} className="border-r border-slate-200 px-3 flex items-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
                </div>
                <div className="flex-1 relative overflow-hidden">
                  {diasCalendario.map((dia, i) => {
                    const pct = (i / totalDias) * 100;
                    const diaLabel = LABEL_DIA[dia.getDay()];
                    const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
                    const isDom = dia.getDay() === 0;
                    const isSab = dia.getDay() === 6;
                    const isFeriado = feriadosSet.has(toStr(dia));
                    const larguraPct = (1 / totalDias) * 100;
                    // Só mostrar em zoom <= 60 dias
                    if (totalDias > 60 && i % 7 !== 0) return null;

                    return (
                      <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                        style={{
                          left: `${pct}%`,
                          width: `${larguraPct}%`,
                          backgroundColor: bgCor,
                          borderLeft: '1px solid rgba(0,0,0,0.04)',
                        }}>
                        {totalDias <= 60 && (
                          <>
                            <span className={`text-xs font-bold leading-none ${
                              isFeriado ? 'text-red-500' :
                              isDom ? 'text-indigo-600' :
                              isSab ? 'text-indigo-400' : 'text-slate-500'
                            }`}>{diaLabel}</span>
                            <span className="text-xs text-slate-400 leading-none mt-0.5">
                              {dia.getDate()}
                            </span>
                          </>
                        )}
                        {totalDias > 60 && i % 7 === 0 && (
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pavimentos */}
              {pavimentosFiltrados.map((pav, pavIdx) => {
                const alturaTotal = pav.numLinhas * ALTURA_LINHA;
                return (
                  <div key={pav.id} className={`flex border-b border-slate-100 ${pavIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`} style={{ height: alturaTotal }}>
                    {/* Nome */}
                    <div
                      style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
                      className="border-r border-slate-200 px-3 flex flex-col justify-center relative group cursor-pointer hover:bg-blue-50 transition-colors"
                      onClick={() => {
                        if (modoLeitura) {
                          setMensagem({ tipo: 'error', texto: '🔒 Versão Definitiva é somente leitura.' });
                          setTimeout(() => setMensagem(null), 3000);
                          return;
                        }
                        abrirEditarBloco(pav.blocoNome, pav.numLinhas);
                      }}
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
                      {/* Grade vertical diária com cores de FDS/feriados */}
                      {diasCalendario.map((dia, i) => {
                        const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
                        return (
                          <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${(i / totalDias) * 100}%`,
                              width: `${(1 / totalDias) * 100}%`,
                              backgroundColor: bgCor || 'transparent',
                              borderLeft: '1px solid rgba(0,0,0,0.04)',
                            }} />
                        );
                      })}
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
                        const temConflito = conflitos.set.has(at.id);
                        const motivoConflito = conflitos.motivoConflito[at.id];
                        const temVinculo = !!at.vinculo_id;
                        const temSubs = (at.subatividades?.length ?? 0) > 0;

                        // Clamp: não deixar barra sair dos limites do zoom
                        const leftPct = Math.max(0, (dispDia / totalDias) * 100);
                        const rightPct = Math.min(100, ((dispDia + dur) / totalDias) * 100);
                        const widthPct = Math.max(0, rightPct - leftPct);
                        if (widthPct <= 0) return null; // fora do zoom, não renderizar

                        return (
                          <div
                            key={at.id}
                            className={`absolute rounded overflow-hidden select-none z-10 ${isDragging ? 'opacity-60 cursor-grabbing z-20' : 'cursor-grab hover:opacity-90'} ${atualizando ? 'pointer-events-none' : ''}`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: linhaAt * ALTURA_LINHA + 4,
                              height: ALTURA_LINHA - 8,
                              minWidth: 4,
                              border: isDragging ? '2px dashed #3B82F6' : temConflito ? '2px solid #EF4444' : temVinculo ? '2px solid rgba(255,255,255,0.5)' : 'none',
                              backgroundColor: cor,
                            }}
                            onMouseDown={e => handleMouseDown(e, at, pav)}
                            onContextMenu={e => handleContextMenuAt(e, at, pav)}
                            onMouseEnter={e => {
                              if (!drag) {
                                setTooltip({ at, pav, x: e.clientX, y: e.clientY });
                                if (at.vinculo_id) setHoverVinculo(at.vinculo_id);
                              }
                            }}
                            onMouseLeave={() => {
                              if (!drag) {
                                setTooltip(null);
                                setHoverVinculo(null);
                              }
                            }}
                          >
                            {/* Segmentos de subatividades */}
                            {temSubs && !isDragging && (
                              <div className="absolute inset-x-0 bottom-0 flex" style={{ height: '40%' }}>
                                {(() => {
                                  const duracaoTotal = calcDuracaoTotal(at.subatividades!);
                                  return at.subatividades!.map((s, i) => (
                                    <div
                                      key={s.id}
                                      className="h-full"
                                      style={{
                                        width: `${(s.duracao / duracaoTotal) * 100}%`,
                                        backgroundColor: s.cor || getCorSub(at.nome, i),
                                        borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.4)' : 'none',
                                      }}
                                      title={`${s.nome}: ${s.duracao}d${s.equipe ? ` | ${s.equipe}` : ''}${s.efetivo ? ` | ${s.efetivo} func.` : ''}`}
                                    />
                                  ));
                                })()}
                              </div>
                            )}

                            {/* Label da atividade */}
                            <div className={`absolute inset-x-0 top-0 flex items-center px-2 ${temSubs ? 'bottom-[40%]' : 'bottom-0'}`}>
                              <span className="text-white text-xs font-semibold truncate drop-shadow leading-none flex-1">
                                {at.nome}
                              </span>
                              {temVinculo && <span className="text-white/80 text-xs ml-1 flex-shrink-0">🔗</span>}
                              {temConflito && <span className="text-xs ml-1 flex-shrink-0">⚠️</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Área vazia se sem pavimentos */}
              {pavimentosFiltrados.length === 0 && (
                <div className="p-16 text-center text-slate-400">
                  <p className="text-4xl mb-3">📊</p>
                  <p>Nenhum pavimento cadastrado</p>
                </div>
              )}
            </div>
            );
            })()}
          </div>
        </div>

        {/* Legenda — após o gráfico */}
        {Object.keys(coresCache).length > 0 && (
          <div className="mt-4 bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-slate-700 mr-2">🎨 Legenda:</span>
            {Object.entries(coresCache).map(([nome, cor]) => (
              <div key={nome} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
                <span className="text-xs text-slate-700">{nome}</span>
              </div>
            ))}
          </div>
        )}

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
          style={{ left: tooltip.x + 16, top: tooltip.y - 80, minWidth: 240, maxWidth: 320 }}>
          <p className="font-bold text-slate-900 mb-2">{tooltip.at.nome}</p>
          <div className="space-y-1 text-sm text-slate-600">
            <p>🏢 {tooltip.pav.nome}</p>
            <p>📅 {fmtDate(tooltip.at.data_inicio)} → {fmtDate(tooltip.at.data_fim)}</p>
            <p>⏱️ {diffDias(parseDate(tooltip.at.data_inicio), parseDate(tooltip.at.data_fim)) + 1} dias</p>
            {tooltip.at.equipe && (tooltip.at.subatividades?.length ?? 0) === 0 && (
              <p>👥 {tooltip.at.equipe}
                {tooltip.at.efetivo ? <span className="ml-2 font-semibold text-blue-600">· {tooltip.at.efetivo} func.</span> : null}
              </p>
            )}
            {tooltip.at.vinculo_id && <p className="text-blue-600 font-semibold">🔗 Vinculada</p>}
            {conflitos.set.has(tooltip.at.id) && (
              <p className="text-red-600 font-semibold text-xs mt-1">
                ⚠️ {conflitos.motivoConflito[tooltip.at.id] || 'Conflito detectado'}
              </p>
            )}
          </div>
          {/* Subatividades no tooltip */}
          {(tooltip.at.subatividades?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">Subatividades:</p>
              <div className="space-y-1">
                {tooltip.at.subatividades!.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.cor || getCorSub(tooltip.at.nome, i) }}></div>
                    <span className="text-slate-700 font-medium">{s.nome}</span>
                    <span className="text-slate-400">{s.duracao}d</span>
                    {s.equipe && <span className="text-slate-400">| {s.equipe}</span>}
                    {s.efetivo && <span className="text-slate-400">| {s.efetivo} func.</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal Criar Atividade ─── */}
      {modalCriar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">✨ Nova Atividade</h3>
            <p className="text-xs text-slate-500 mb-5">{modalCriar.pav.nome} — Linha {modalCriar.linha + 1} — a partir de {fmtDate(modalCriar.dataInicio)}</p>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome *</label>
                <input type="text" value={formCriar.nome} onChange={e => setFormCriar(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Alvenaria, Estrutura, Reboco"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>

              {/* Toggle subatividades */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={usarSubs} onChange={e => setUsarSubs(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-semibold text-slate-700">📋 Dividir em subatividades</span>
              </label>

              {/* Subatividades */}
              {usarSubs ? (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Subatividades ({subsCriar.length})</p>
                    <button type="button"
                      onClick={() => setSubsCriar(p => [...p, { id: gerarUUID(), nome: '', duracao: '5', equipe: '', efetivo: '' }])}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200">
                      + Adicionar
                    </button>
                  </div>
                  {subsCriar.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">Clique em "+ Adicionar" para criar subatividades</p>
                  )}
                  {subsCriar.map((s, i) => (
                    <div key={s.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getCorSub(formCriar.nome || 'x', i) }}></div>
                        <input type="text" value={s.nome} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,nome:e.target.value} : x))}
                          placeholder={`Nome subatividade ${i+1}`}
                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                        <button onClick={() => setSubsCriar(p => p.filter((_,j) => j!==i))}
                          className="text-red-400 hover:text-red-600 text-lg w-6 flex-shrink-0">×</button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-slate-500">Duração (dias)</label>
                          <input type="number" min="1" value={s.duracao} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,duracao:e.target.value} : x))}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Equipe</label>
                          <input type="text" value={s.equipe} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,equipe:e.target.value} : x))}
                            placeholder="Ex: A"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Efetivo</label>
                          <input type="number" min="1" value={s.efetivo} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,efetivo:e.target.value} : x))}
                            placeholder="Qtd"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {subsCriar.length > 0 && (
                    <div className="bg-blue-50 rounded p-2 text-xs text-blue-700 font-semibold">
                      ⏱️ {calcDuracaoTotal(subsCriar.map(s => ({ duracao: parseInt(s.duracao)||0 })))} dias úteis
                      &nbsp;·&nbsp; 📅 Até {fmtDate(toStr(calcDataFimUtil(parseDate(modalCriar.dataInicio), calcDuracaoTotal(subsCriar.map(s => ({ duracao: parseInt(s.duracao)||0 }))))))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Duração (dias) *</label>
                    <input type="number" min="1" value={formCriar.duracao} onChange={e => setFormCriar(p => ({ ...p, duracao: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
                    <input type="text" value={formCriar.equipe} onChange={e => setFormCriar(p => ({ ...p, equipe: e.target.value }))}
                      placeholder="Ex: Equipe A"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Efetivo</label>
                    <input type="number" min="1" value={formCriar.efetivo} onChange={e => setFormCriar(p => ({ ...p, efetivo: e.target.value }))}
                      placeholder="Qtd func."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                  </div>
                </div>
              )}

              {/* Preview data (sem subs) */}
              {!usarSubs && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                  {(() => {
                    const ini = calcInicioUtil(parseDate(modalCriar.dataInicio));
                    const fim = calcDataFimUtil(ini, parseInt(formCriar.duracao) || 1);
                    return <>📅 <strong>{fmtDate(toStr(ini))}</strong> até <strong>{fmtDate(toStr(fim))}</strong>
                      {(!sabadoUtil || !domingoUtil || feriadosSet.size > 0) && (
                        <span className="text-xs text-blue-600 ml-2">(dias úteis)</span>
                      )}</>;
                  })()}
                </div>
              )}

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
                      <div className="ml-6 space-y-1 max-h-36 overflow-y-auto">
                        <label className="flex items-center gap-2 text-xs text-slate-500 mb-2 cursor-pointer">
                          <input type="checkbox" checked={pavSelecionados.length === pavimentosDoBloco.length}
                            onChange={e => setPavSelecionados(e.target.checked ? pavimentosDoBloco.map(p => p.id) : [])}
                            className="w-3.5 h-3.5 rounded accent-blue-600" />
                          Selecionar todos
                        </label>
                        {pavimentosDoBloco.map(p => (
                          <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                            <input type="checkbox" checked={pavSelecionados.includes(p.id)}
                              onChange={e => setPavSelecionados(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                              className="w-4 h-4 rounded accent-blue-600" />
                            {p.nome.includes(' - ') ? p.nome.split(' - ').slice(1).join(' - ') : p.nome}
                          </label>
                        ))}
                      </div>
                      {pavSelecionados.length > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={vincular} onChange={e => setVincular(e.target.checked)}
                            className="w-4 h-4 rounded accent-purple-600" />
                          <div>
                            <span className="text-sm font-semibold text-slate-700">🔗 Vincular em cascata</span>
                            <p className="text-xs text-slate-500">Cada pavimento começa 1 dia após o fim do anterior</p>
                          </div>
                        </label>
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
              <button onClick={handleCriar} disabled={criando || !formCriar.nome.trim() || (usarSubs && subsCriar.length === 0)}
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
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">✏️ Editar Atividade</h3>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome</label>
                <input type="text" value={formEditar.nome} onChange={e => setFormEditar(p => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>

              {/* Datas — só mostrar se não tiver subs */}
              {subsEditar.length === 0 && (
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
              )}

              {/* Data início quando tem subs */}
              {subsEditar.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label>
                  <input type="date" value={formEditar.dataInicio} onChange={e => setFormEditar(p => ({ ...p, dataInicio: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
              )}

              {/* Equipe e Efetivo (só se não tem subs) */}
              {subsEditar.length === 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
                    <input type="text" value={formEditar.equipe} onChange={e => setFormEditar(p => ({ ...p, equipe: e.target.value }))}
                      placeholder="Ex: Equipe A"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Efetivo (func.)</label>
                    <input type="number" min="1" value={formEditar.efetivo} onChange={e => setFormEditar(p => ({ ...p, efetivo: e.target.value }))}
                      placeholder="Qtd"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                  </div>
                </div>
              )}

              {/* Subatividades */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">📋 Subatividades ({subsEditar.length})</p>
                  <button type="button"
                    onClick={() => setSubsEditar(p => [...p, { id: gerarUUID(), nome: '', duracao: '5', equipe: '', efetivo: '' }])}
                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200">
                    + Adicionar
                  </button>
                </div>

                {subsEditar.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">Sem subatividades. Clique em "+ Adicionar" para criar.</p>
                )}

                {subsEditar.map((s, i) => (
                  <div key={s.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getCorSub(formEditar.nome || modalEditar.at.nome, i) }}></div>
                      <input type="text" value={s.nome}
                        onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,nome:e.target.value} : x))}
                        placeholder={`Nome subatividade ${i+1}`}
                        className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                      <button onClick={() => setSubsEditar(p => p.filter((_,j) => j!==i))}
                        className="text-red-400 hover:text-red-600 text-lg w-6 flex-shrink-0">×</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-slate-500">Duração (dias)</label>
                        <input type="number" min="1" value={s.duracao}
                          onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,duracao:e.target.value} : x))}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Equipe</label>
                        <input type="text" value={s.equipe}
                          onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,equipe:e.target.value} : x))}
                          placeholder="Ex: A"
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Efetivo</label>
                        <input type="number" min="1" value={s.efetivo}
                          onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,efetivo:e.target.value} : x))}
                          placeholder="Qtd"
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                      </div>
                    </div>
                  </div>
                ))}

                {subsEditar.length > 0 && (
                  <div className="bg-blue-50 rounded p-2 text-xs text-blue-700 font-semibold">
                    ⏱️ {calcDuracaoTotal(subsEditar.map(s => ({ duracao: parseInt(s.duracao)||0 })))} dias úteis
                    &nbsp;·&nbsp; 📅 Até {fmtDate(toStr(calcDataFimUtil(parseDate(formEditar.dataInicio), calcDuracaoTotal(subsEditar.map(s => ({ duracao: parseInt(s.duracao)||0 }))))))}
                  </div>
                )}
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
              {pavimentosExibidos.flatMap(pav => pav.atividades
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

      {/* ─── Modal Filtros de Pavimentos ─── */}
      {modalFiltros && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">🏢 Filtrar Pavimentos</h3>
              <div className="flex gap-2">
                <button onClick={() => setPavimentosFiltro(new Set())}
                  className="px-2 py-1 text-xs text-blue-600 hover:underline">Todos</button>
                <button onClick={() => setPavimentosFiltro(new Set(pavimentosExibidos.map(p => p.id)))}
                  className="px-2 py-1 text-xs text-slate-500 hover:underline">Nenhum</button>
              </div>
            </div>

            {/* Agrupar por bloco */}
            <div className="overflow-y-auto flex-1 space-y-3">
              {(() => {
                const grupos: Record<string, PavComAtiv[]> = {};
                pavimentosExibidos.forEach(p => {
                  const b = p.blocoNome || 'Sem Bloco';
                  if (!grupos[b]) grupos[b] = [];
                  grupos[b].push(p);
                });
                return Object.entries(grupos).map(([bloco, pavs]) => (
                  <div key={bloco} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-700 text-sm">🏢 {bloco}</span>
                      <button
                        onClick={() => {
                          const ids = pavs.map(p => p.id);
                          const todosAtivos = ids.every(id => pavimentosFiltro.size === 0 || pavimentosFiltro.has(id));
                          setPavimentosFiltro(prev => {
                            const next = new Set(prev.size === 0 ? pavimentosExibidos.map(p => p.id) : prev);
                            if (todosAtivos) ids.forEach(id => next.delete(id));
                            else ids.forEach(id => next.add(id));
                            return next.size === pavimentosExibidos.length ? new Set() : next;
                          });
                        }}
                        className="text-xs text-blue-600 hover:underline">
                        {pavs.every(p => pavimentosFiltro.size === 0 || pavimentosFiltro.has(p.id)) ? 'Remover bloco' : 'Adicionar bloco'}
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {pavs.map(pav => {
                        const ativo = pavimentosFiltro.size === 0 || pavimentosFiltro.has(pav.id);
                        const nomeSufixo = pav.nome.includes(' - ') ? pav.nome.split(' - ').slice(1).join(' - ') : pav.nome;
                        return (
                          <label key={pav.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={ativo}
                              onChange={() => {
                                setPavimentosFiltro(prev => {
                                  // se vazio = todos ativos, expandir para set completo menos este
                                  const base = prev.size === 0
                                    ? new Set(pavimentosExibidos.map(p => p.id))
                                    : new Set(prev);
                                  if (base.has(pav.id)) base.delete(pav.id);
                                  else base.add(pav.id);
                                  // se todos marcados, volta para vazio (= todos)
                                  return base.size === pavimentosExibidos.length ? new Set() : base;
                                });
                              }}
                              className="w-4 h-4 rounded accent-blue-600" />
                            <span className="text-sm text-slate-700">{nomeSufixo}</span>
                            {pav.numero !== null && <span className="text-xs text-slate-400 ml-auto">Nº {pav.numero}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => { setPavimentosFiltro(new Set()); setModalFiltros(false); }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Limpar Filtros
              </button>
              <button onClick={() => setModalFiltros(false)}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Aplicar ({pavimentosFiltro.size === 0 ? 'todos' : pavimentosFiltro.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Overlay Tela Cheia ─── */}
      {telaCheia && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          {/* Header tela cheia */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white text-sm">📊</span></div>
              <div>
                <p className="font-bold text-slate-900">{obra?.nome} — Linha de Balanço</p>
                <p className="text-xs text-slate-500">{dataMin.toLocaleDateString('pt-BR')} → {addDias(dataMin, totalDias).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom */}
              <input type="date" value={zoomInicio} onChange={e => setZoomInicio(e.target.value)}
                className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-900 outline-none" />
              <span className="text-slate-400">→</span>
              <input type="date" value={zoomFim} onChange={e => setZoomFim(e.target.value)}
                className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-900 outline-none" />
              {(zoomInicio || zoomFim) && (
                <button onClick={() => { setZoomInicio(''); setZoomFim(''); }}
                  className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">✕</button>
              )}
              <div className="w-px h-6 bg-slate-200 mx-1"></div>
              {/* Filtro pavimentos */}
              <button onClick={() => setModalFiltros(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${pavimentosFiltro.size > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                🏢 {pavimentosFiltro.size > 0 ? `${pavimentosFiltro.size} pavtos` : 'Todos'}
              </button>
              {/* Imprimir */}
              <button onClick={handleImprimir}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300">
                🖨️ Imprimir
              </button>
              {/* Fechar */}
              <button onClick={() => setTelaCheia(false)}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold border border-red-200">
                ✕ Fechar
              </button>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 px-6 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0 text-xs text-slate-500 flex-wrap">
            {Object.entries(coresCache).map(([nome, cor]) => (
              <div key={nome} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
                <span>{nome}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.06)' }}></div><span>Sáb</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}></div><span>Dom</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}></div><span>Feriado</span></div>
            </div>
          </div>

          {/* Gráfico em tela cheia */}
          <div className="flex-1 overflow-auto" id="grafico-print">
            {(() => {
              const pxPorDia = totalDias <= 30 ? 44 : totalDias <= 60 ? 30 : totalDias <= 120 ? 20 : 12;
              const larguraTotal = LARGURA_NOME + totalDias * pxPorDia;
              return (
                <div style={{ width: `${Math.max(larguraTotal, window.innerWidth - 40)}px`, position: 'relative', minHeight: '100%' }}>
                  {/* Eixo X */}
                  <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10" style={{ height: 44 }}>
                    <div style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }} className="border-r border-slate-200 px-3 flex items-center bg-slate-50">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
                    </div>
                    <div className="flex-1 relative overflow-hidden">
                      {diasCalendario.map((dia, i) => {
                        const pct = (i / totalDias) * 100;
                        const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
                        const isDom = dia.getDay() === 0;
                        const isSab = dia.getDay() === 6;
                        const isFer = feriadosSet.has(toStr(dia));
                        const larg = (1 / totalDias) * 100;
                        return (
                          <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                            style={{ left: `${pct}%`, width: `${larg}%`, backgroundColor: bgCor, borderLeft: '1px solid rgba(0,0,0,0.04)' }}>
                            <span className={`text-xs font-bold leading-none ${isFer ? 'text-red-500' : isDom ? 'text-indigo-600' : isSab ? 'text-indigo-400' : 'text-slate-500'}`}>
                              {LABEL_DIA[dia.getDay()]}
                            </span>
                            <span className="text-xs text-slate-400 leading-none mt-0.5">{dia.getDate()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Linhas */}
                  {pavimentosFiltrados.map((pav, pavIdx) => (
                    <div key={pav.id} className={`flex border-b border-slate-100 ${pavIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      style={{ height: pav.numLinhas * ALTURA_LINHA }}>
                      <div style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
                        className="border-r border-slate-200 px-3 flex flex-col justify-center">
                        <p className="text-xs font-semibold text-slate-800 truncate">{pav.nome}</p>
                        {pav.numero !== null && <p className="text-xs text-slate-400">Nº {pav.numero}</p>}
                      </div>
                      <div className="flex-1 relative">
                        {diasCalendario.map((dia, i) => {
                          const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
                          return bgCor ? <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: `${(i/totalDias)*100}%`, width: `${(1/totalDias)*100}%`, backgroundColor: bgCor }} /> : null;
                        })}
                        {Array.from({ length: pav.numLinhas - 1 }, (_, i) => (
                          <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-200" style={{ top: (i+1)*ALTURA_LINHA }} />
                        ))}
                        {pav.atividades.map(at => {
                          const dispDia = diffDias(dataMin, parseDate(at.data_inicio));
                          const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
                          const leftPct = Math.max(0, (dispDia / totalDias) * 100);
                          const widthPct = Math.max(0, Math.min(100, ((dispDia + dur) / totalDias) * 100) - leftPct);
                          if (widthPct <= 0) return null;
                          const cor = getCor(at.nome);
                          const linhaAt = at.linha_index ?? 0;
                          return (
                            <div key={at.id} className="absolute rounded overflow-hidden select-none"
                              style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: linhaAt*ALTURA_LINHA+4, height: ALTURA_LINHA-8, backgroundColor: cor, minWidth: 4 }}>
                              <div className="absolute inset-x-0 top-0 flex items-center px-2 bottom-0">
                                <span className="text-white text-xs font-semibold truncate drop-shadow">{at.nome}</span>
                              </div>
                              {(at.subatividades?.length ?? 0) > 0 && (
                                <div className="absolute inset-x-0 bottom-0 flex" style={{ height: '40%' }}>
                                  {at.subatividades!.map((s, i) => {
                                    const durT = at.subatividades!.reduce((a,b) => a+(b.duracao||0), 0);
                                    return <div key={s.id} className="h-full" style={{ width: `${(s.duracao/durT)*100}%`, backgroundColor: s.cor || getCorSub(at.nome,i), borderLeft: i>0?'1px solid rgba(255,255,255,0.4)':'none' }} />;
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
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

      {/* ─── Modal de Saída com Alterações Não Salvas ─── */}
      {modalSaida && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Alterações não salvas</h3>
                <p className="text-sm text-slate-500">Você tem alterações que ainda não foram salvas.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              Se sair agora, as alterações feitas na versão em andamento serão perdidas.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setModalSaida(null);
                  setModalVersao(true);
                }}
                className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
              >
                💾 Salvar antes de sair
              </button>
              <button
                onClick={() => {
                  const destino = modalSaida.destino;
                  setModalSaida(null);
                  limparDirty();
                  if (destino) router.push(destino);
                }}
                className="w-full px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition-colors"
              >
                🗑️ Descartar alterações e sair
              </button>
              <button
                onClick={() => setModalSaida(null)}
                className="w-full px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Continuar editando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Salvar Versão ─── */}
      {modalVersao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-1">💾 Salvar Versão</h3>
            <p className="text-xs text-slate-500 mb-1">Snapshot do estado atual da Linha de Balanço</p>
            {modoRascunho && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                📋 Baseado em: <strong>"{versaoAtual?.nome}"</strong> — a Definitiva original não será alterada
              </div>
            )}

            <div className="space-y-4">
              {/* Opção: sobrescrever versão em atualização existente */}
              {versoes.filter(v => v.status === 'Em Atualização').length > 0 && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Salvar em cima de versão existente?
                  </label>
                  <select
                    value={formVersao.sobrescreverVersaoId ?? ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const v = id ? versoes.find(v => v.id === id) : null;
                      setFormVersao(p => ({
                        ...p,
                        sobrescreverVersaoId: id,
                        nome: v ? v.nome : p.nome,
                        erroNome: '',
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">— Criar nova versão —</option>
                    {versoes.filter(v => v.status === 'Em Atualização').map(v => (
                      <option key={v.id} value={v.id}>🔄 {v.nome}</option>
                    ))}
                  </select>
                  {formVersao.sobrescreverVersaoId && (
                    <p className="text-xs text-yellow-600 mt-1">⚠️ O snapshot desta versão será substituído</p>
                  )}
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome da Versão *</label>
                <input type="text" value={formVersao.nome}
                  onChange={e => setFormVersao(p => ({ ...p, nome: e.target.value, erroNome: '' }))}
                  placeholder="Ex: Baseline, Rev. 1, Aprovada Cliente"
                  disabled={!!formVersao.sobrescreverVersaoId}
                  className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 ${
                    formVersao.erroNome ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  } ${formVersao.sobrescreverVersaoId ? 'bg-slate-100 text-slate-500' : ''}`} />
                {formVersao.erroNome && (
                  <p className="text-xs text-red-600 mt-1">❌ {formVersao.erroNome}</p>
                )}
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
                <textarea value={formVersao.descricao}
                  onChange={e => setFormVersao(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Versão aprovada em reunião de 28/04"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 min-h-16" />
              </div>

              {/* Status — desabilitado ao sobrescrever */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
                <div className="flex gap-3">
                  {(['Definitiva', 'Em Atualização'] as const).map(s => {
                    const bloqueado = !!formVersao.sobrescreverVersaoId && s === 'Definitiva';
                    return (
                      <button key={s} type="button"
                        disabled={bloqueado}
                        onClick={() => !bloqueado && setFormVersao(p => ({ ...p, status: s }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                          formVersao.status === s
                            ? s === 'Definitiva'
                              ? 'bg-green-600 border-green-600 text-white'
                              : 'bg-yellow-500 border-yellow-500 text-white'
                            : bloqueado
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        {s === 'Definitiva' ? '✅ Definitiva' : '🔄 Em Atualização'}
                      </button>
                    );
                  })}
                </div>
                {formVersao.status === 'Definitiva' && !formVersao.sobrescreverVersaoId && (
                  <p className="text-xs text-green-600 mt-1">Esta versão será carregada por padrão no Dashboard</p>
                )}
                {formVersao.sobrescreverVersaoId && (
                  <p className="text-xs text-slate-400 mt-1">Versões em atualização não podem ser promovidas a Definitiva aqui</p>
                )}
              </div>

              {/* Resumo */}
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                📊 Snapshot: <strong>{pavimentos.length} pavimentos</strong>, <strong>{totalAtividades} atividades</strong>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => {
                setModalVersao(false);
                setFormVersao({ nome: '', descricao: '', status: 'Em Atualização', sobrescreverVersaoId: null, erroNome: '' });
              }} disabled={salvandoVersao}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSalvarVersao} disabled={salvandoVersao || !formVersao.nome.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
                {salvandoVersao ? '⏳ Salvando...' : formVersao.sobrescreverVersaoId ? '🔄 Atualizar' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Histórico de Versões ─── */}
      {modalHistorico && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">🕒 Histórico de Versões</h3>
                <p className="text-xs text-slate-500">{versoes.length} versão(ões) salva(s)</p>
              </div>
              <button onClick={() => { setModalHistorico(false); setModalVersao(true); }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold">
                + Nova Versão
              </button>
            </div>

            {versoes.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">📭</p>
                <p>Nenhuma versão salva ainda</p>
              </div>
            ) : (
              <div className="overflow-y-auto space-y-2 flex-1">
                {versoes.map(v => {
                  const isAtual = versaoAtual?.id === v.id;
                  const data = new Date(v.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <div key={v.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isAtual ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-purple-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 cursor-pointer" onClick={() => {
                          if (isDirty && !modoLeitura) {
                            destinoPendente.current = null;
                            setModalSaida({ destino: null, tipo: 'navegacao' });
                            // Guardar versão alvo para trocar após decisão
                            // Por simplicidade, confirmamos direto
                            if (!confirm('Há alterações não salvas. Descartar e trocar de versão?')) return;
                          }
                          limparDirty();
                          setVersaoAtual(v);
                          setModalHistorico(false);
                        }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${v.status === 'Definitiva' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                            <p className="font-bold text-slate-900">{v.nome}</p>
                            {isAtual && <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-semibold">Ativa</span>}
                          </div>
                          <p className="text-xs text-slate-500 ml-4">{v.status} · {data}</p>
                          {v.descricao && <p className="text-xs text-slate-600 ml-4 mt-1 italic">{v.descricao}</p>}
                          <p className="text-xs text-slate-400 ml-4 mt-1">
                            {v.snapshot?.pavimentos?.length ?? 0} pavimentos · {' '}
                            {v.snapshot?.pavimentos?.reduce((acc: number, p: any) => acc + (p.atividades?.length ?? 0), 0) ?? 0} atividades
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {!isAtual && (
                            <span className="text-xs text-purple-600 font-semibold cursor-pointer"
                              onClick={() => { setVersaoAtual(v); setModalHistorico(false); }}>
                              Carregar →
                            </span>
                          )}
                          {/* Excluir — bloqueado se for única definitiva */}
                          {(() => {
                            const definitivas = versoes.filter(v2 => v2.status === 'Definitiva');
                            const bloqueado = v.status === 'Definitiva' && definitivas.length <= 1;
                            return (
                              <button
                                onClick={() => handleExcluirVersao(v)}
                                disabled={bloqueado}
                                title={bloqueado ? 'Não é possível excluir a única versão Definitiva' : `Excluir "${v.nome}"`}
                                className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
                                  bloqueado
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                              >
                                🗑️
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={() => setModalHistorico(false)}
              className="mt-4 w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
