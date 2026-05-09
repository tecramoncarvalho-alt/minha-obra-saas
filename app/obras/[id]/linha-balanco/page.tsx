'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Obra, Feriado, Pavimento, Subatividade, Atividade, PavComAtiv, Versao, ApontamentoDiario, StatusAtividade, Dependencia } from '@/app/lib/types';
import { getCor, getCorSub, calcDuracaoTotal, coresCache } from './utils/geradorCores';
import { gerarUUID } from './utils/helpers';
import { parseDate, toStr, addDias, diffDias, LABEL_DIA } from '@/app/calendario';
import { useCalendarioAtividades } from './hooks/useCalendarioAtividades';
import { useConflitos } from './hooks/useConflitos';
import { useAtividades } from './hooks/useAtividades';
import { useVinculos } from './hooks/useVinculos';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { ModalCriarAtividade } from './components/modais/ModalCriarAtividade';
import { ModalEditarAtividade } from './components/modais/ModalEditarAtividade';
import { ModalVincular } from './components/modais/ModalVincular';
import { ModalFiltros } from './components/modais/ModalFiltros';
import { ModalExcluirComVinculo } from './components/modais/ModalExcluirComVinculo';
import { ModalEditarLinhas } from './components/modais/ModalEditarLinhas';
import { ModalSaida } from './components/modais/ModalSaida';
import { ModalSalvarVersao } from './components/modais/ModalSalvarVersao';
import { ModalHistoricoVersoes } from './components/modais/ModalHistoricoVersoes';
import { ModalAdicionarDependencia } from './components/modais/ModalAdicionarDependencia';
import { LegendaCores } from './components/LegendaCores';
import { GraficoLinhaBalanco } from './components/GraficoLinhaBalanco';
import { ToolbarSuperior } from './components/ToolbarSuperior';
import { HeaderLinhaBalanco } from './components/HeaderLinhaBalanco';
import { BannersLinhaBalanco } from './components/BannersLinhaBalanco';
import { TelaCheia } from './components/TelaCheia';
import { ContextMenu } from './components/ContextMenu';
import { TooltipAtividade } from './components/TooltipAtividade';

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


const corColunaDia = (data: Date, feriadosSet: Set<string>, sabUtil: boolean, domUtil: boolean): string | undefined => {
  const dia = data.getDay();
  const s = toStr(data);
  if (feriadosSet.has(s)) return 'rgba(239,68,68,0.12)';
  if (dia === 0) return domUtil ? undefined : 'rgba(99,102,241,0.12)';
  if (dia === 6) return sabUtil ? undefined : 'rgba(99,102,241,0.06)';
  return undefined;
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

  const { calcInicioUtil, calcDataFimUtil, calcProximoInicioUtil } = useCalendarioAtividades(calendarioRef);

  // Zoom / Filtro de datas
  const [zoomInicio, setZoomInicio] = useState('');
  const [zoomFim, setZoomFim] = useState('');

  // Tela cheia e filtros avançados
  const [telaCheia, setTelaCheia] = useState(false);
  const [pavimentosFiltro, setPavimentosFiltro] = useState<Set<number>>(new Set()); // vazio = todos
  const [modalFiltros, setModalFiltros] = useState(false);
  // ─── Avanço real na linha de balanço ───
  const [mostrarAvancoReal, setMostrarAvancoReal] = useState(false);
  const [progrealPorAtividade, setProgrealPorAtividade] = useState<Record<number, { percentual: number; status: StatusAtividade }>>({});

  // ─── Versões ───
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoAtual, setVersaoAtual] = useState<Versao | null>(null);

  // ─── snapshotBase e modoRascunho — devem vir ANTES de pavimentosExibidos ───
  const [snapshotBase, setSnapshotBase] = useState<Versao['snapshot'] | null>(null);
  const modoRascunho = snapshotBase !== null;

  // ─── Converter snapshot em PavComAtiv — declarado ANTES de qualquer useMemo ───
  const snapshotParaPavimentos = (snapshot: Versao['snapshot']): PavComAtiv[] => {
    if (!snapshot?.pavimentos) return [];
    return snapshot.pavimentos.map(pav => ({
      id: pav.id, obra_id: obraId, nome: pav.nome,
      numero: pav.numero ?? null, observacao: null,
      blocoNome: pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : pav.nome,
      numLinhas: pav.numLinhas ?? 1,
      atividades: (pav.atividades || []).map(at => ({
        ...at,
        pavimento_id: pav.id,
        linha_index: at.linha_index ?? 0,
        vinculo_id: at.vinculo_id ?? null,
        vinculo_ordem: at.vinculo_ordem ?? null,
        efetivo: at.efetivo ?? null,
        subatividades: (at.subatividades || []).map((s, k: number) => ({
          ...s, atividade_id: at.id, cor: getCorSub(at.nome, k),
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

  const marcarDirty = () => { if (!modoLeitura) setIsDirty(true); };
  const limparDirty = () => setIsDirty(false);

  const {
    atualizarAtividadeLocal, removerAtividadeLocal,
    propagarVinculoLocal, propagarDependenciasLocal, atualizarNumLinhasBloco,
  } = useAtividades(setPavimentos, marcarDirty, calendarioRef, calcDataFimUtil);

  // Tooltip
  const [tooltip, setTooltip] = useState<{at:Atividade;pav:PavComAtiv;x:number;y:number}|null>(null);

  // Hover de vínculo — para desenhar linhas pontilhadas
  const [hoverVinculo, setHoverVinculo] = useState<string | null>(null);
  const graficoRef = useRef<HTMLDivElement>(null); // ref do div interno do gráfico

  // Menu de contexto
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    tipo: 'vazio' | 'atividade';
    pav?: PavComAtiv; diaClicado?: number; linhaClicada?: number;
    at?: Atividade;
  } | null>(null);

  // ─── Dependências externas (cross-chain) ───
  const [dependencias, setDependencias] = useState<Dependencia[]>([]);
  const [modalAdicionarDep, setModalAdicionarDep] = useState<{ at: Atividade } | null>(null);

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
  const [formEditar, setFormEditar] = useState({ nome: '', dataInicio: '', dataFim: '', equipe: '', efetivo: '', vinculo_lag: 0 });
  const [subsEditar, setSubsEditar] = useState<{id:string;dbId?:number;nome:string;duracao:string;equipe:string;efetivo:string}[]>([]);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // Modal de editar linhas do bloco
  const [editandoBloco, setEditandoBloco] = useState<{
    blocoNome: string; linhasAtuais: number; linhasOriginais: number;
    conflitosReducao: {atNome:string;pavNome:string;linha:number}[];
  } | null>(null);
  const [salvandoLinhas, setSalvandoLinhas] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.all([fetchDados(), fetchVersoes()]); }, [obraId]);

  useEffect(() => { router.prefetch(`/obras/${obraId}/dashboard`); }, [obraId, router]);

  // Buscar apontamentos mais recentes por atividade quando o toggle é ativado
  useEffect(() => {
    if (!mostrarAvancoReal) { setProgrealPorAtividade({}); return; }
    const ids = pavimentos.flatMap(p => p.atividades.map(a => a.id));
    if (ids.length === 0) return;
    supabase
      .from('apontamentos_diarios')
      .select('atividade_id,percentual_executado,status,data')
      .in('atividade_id', ids)
      .order('data', { ascending: false })
      .then(({ data }: { data: Pick<ApontamentoDiario, 'atividade_id' | 'percentual_executado' | 'status' | 'data'>[] | null }) => {
        if (!data) return;
        const mapa: Record<number, { percentual: number; status: StatusAtividade }> = {};
        for (const ap of data) {
          if (!mapa[ap.atividade_id]) {
            mapa[ap.atividade_id] = {
              percentual: ap.percentual_executado,
              status: ap.status ?? 'EM_ANDAMENTO',
            };
          }
        }
        setProgrealPorAtividade(mapa);
      });
  }, [mostrarAvancoReal, pavimentos]);

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
      setVersoes(data as Versao[]);
      const definitiva = (data as Versao[]).find(v => v.status === 'Definitiva');
      if (definitiva) setVersaoAtual(definitiva);
      else if (data.length > 0) setVersaoAtual(data[0] as Versao);
    }
  };

  const fetchDados = async () => {
    try {
      setLoading(true);
      const [obraResult, ferResult, pavResult] = await Promise.all([
        supabase.from('obras').select('*').eq('id', obraId).single(),
        supabase.from('feriados').select('*').eq('obra_id', obraId),
        supabase.from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false }),
      ]);
      if (obraResult.data) setObra(obraResult.data);
      setFeriados(ferResult.data || []);

      const pavData = pavResult.data;
      if (!pavData) return;

      const grupos = agruparPorBloco(pavData);
      const ordenados = ordenarBlocos(grupos).flatMap(([, pavs]) => pavs);

      const numLinhasPorBloco: Record<string, number> = {};
      Object.entries(grupos).forEach(([blocoNome, pavs]) => {
        const p = pavs.find(p => p.observacao?.startsWith(PREFIXO_META));
        numLinhasPorBloco[blocoNome] = p ? parseMeta(p.observacao).linhas : 1;
      });

      const pavIds = ordenados.map(p => p.id);

      const { data: todasAtivs } = await supabase
        .from('atividades')
        .select('id,nome,data_inicio,data_fim,duracao_dias,equipe,efetivo,linha_index,vinculo_id,vinculo_ordem,vinculo_lag,pavimento_id')
        .in('pavimento_id', pavIds)
        .order('data_inicio');

      const atividadeIds = (todasAtivs ?? []).map((a: { id: number }) => a.id);

      if (atividadeIds.length > 0) {
        const { data: deps } = await supabase
          .from('dependencias')
          .select('*')
          .or(`predecessora_id.in.(${atividadeIds.join(',')}),sucessora_id.in.(${atividadeIds.join(',')})`);
        setDependencias((deps ?? []) as Dependencia[]);
      } else {
        setDependencias([]);
      }

      const { data: todasSubs } = atividadeIds.length > 0
        ? await supabase
            .from('subatividades')
            .select('id,atividade_id,nome,duracao,equipe,efetivo,ordem')
            .in('atividade_id', atividadeIds)
            .order('ordem')
        : { data: [] as Subatividade[] };

      const subsPorAtividade: Record<number, Subatividade[]> = {};
      for (const s of (todasSubs ?? []) as Subatividade[]) {
        if (!subsPorAtividade[s.atividade_id]) subsPorAtividade[s.atividade_id] = [];
        subsPorAtividade[s.atividade_id].push(s);
      }
      type AtivSemSubs = Omit<Atividade, 'subatividades'>;
      const ativsPorPavimento: Record<number, AtivSemSubs[]> = {};
      for (const a of (todasAtivs ?? []) as AtivSemSubs[]) {
        if (a.pavimento_id != null) {
          if (!ativsPorPavimento[a.pavimento_id]) ativsPorPavimento[a.pavimento_id] = [];
          ativsPorPavimento[a.pavimento_id].push(a);
        }
      }

      const pavCompletos: PavComAtiv[] = ordenados.map((pav) => {
        const blocoNome = pav.nome.includes(' - ') ? pav.nome.split(' - ')[0].trim() : 'Sem Bloco';
        const atividades: Atividade[] = (ativsPorPavimento[pav.id] ?? []).map(
          (a: Omit<Atividade, 'subatividades'>) => ({
            ...a,
            linha_index: a.linha_index ?? 0,
            vinculo_id: a.vinculo_id ?? null,
            vinculo_ordem: a.vinculo_ordem ?? null,
            vinculo_lag: (a as Atividade & { vinculo_lag?: number | null }).vinculo_lag ?? 0,
            subatividades: (subsPorAtividade[a.id] ?? []).map((s: Subatividade, i: number) => ({
              ...s,
              cor: getCorSub(a.nome, i),
            })),
          })
        );
        return { ...pav, blocoNome, atividades, numLinhas: numLinhasPorBloco[blocoNome] ?? 1 };
      });
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

      let versaoSalva: Versao | null = null;

      if (formVersao.sobrescreverVersaoId) {
        // Sobrescrever versão Em Atualização existente
        const { data } = await supabase.from('versoes').update({
          nome, descricao: formVersao.descricao.trim() || null,
          status: formVersao.status, snapshot,
        }).eq('id', formVersao.sobrescreverVersaoId).select().single();
        versaoSalva = data;
        setVersoes(prev => prev.map(v => v.id === formVersao.sobrescreverVersaoId ? (versaoSalva ?? v) : v));
      } else {
        // Nova versão
        const { data } = await supabase.from('versoes').insert({
          obra_id: obraId, nome,
          descricao: formVersao.descricao.trim() || null,
          status: formVersao.status, snapshot,
        }).select().single();
        versaoSalva = data;
        if (versaoSalva) { const sv = versaoSalva; setVersoes(prev => [sv, ...prev]); }
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
  const { dataMin, totalDias } = useMemo(() => {
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
    return { dataMin: zMin, totalDias: Math.max(7, diffDias(zMin, zMax)) };
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

  const conflitos = useConflitos(pavimentosExibidos);

  const { drag, handleMouseDown } = useDragAndDrop({
    dataMin, totalDias, containerRef, modoLeitura, supabase,
    feriadosSet, sabadoUtil, domingoUtil, calcDataFimUtil,
    propagarVinculoLocal, propagarDependenciasLocal, atualizarAtividadeLocal, atualizarSnapshotVersaoAtiva,
    setMensagem, setTooltip, setAtualizando, setCtxMenu: (v) => setCtxMenu(v),
    pavimentos, dependencias,
  });

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
    setFormEditar({ nome: at.nome, dataInicio: at.data_inicio, dataFim: at.data_fim, equipe: at.equipe || '', efetivo: at.efetivo ? String(at.efetivo) : '', vinculo_lag: at.vinculo_lag ?? 0 });
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
      vinculo_lag: formEditar.vinculo_lag ?? 0,
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
      vinculo_lag: formEditar.vinculo_lag ?? 0,
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

  // ─── Excluir atividade — com modal de vínculo ───
  const [modalExcluirAt, setModalExcluirAt] = useState<{
    at: Atividade;
    cadeia: { at: Atividade; pav: PavComAtiv; mesmoLote: boolean }[];
    vinculoId: string | null;
  } | null>(null);
  const [excluindoAtModal, setExcluindoAtModal] = useState(false);

  const abrirExcluirAtividade = () => {
    if (!modalEditar) return;
    const at = modalEditar.at;
    const vinculoId = at.vinculo_id || null;

    if (!vinculoId) {
      // Sem vínculo — excluir direto com confirm simples
      if (!confirm(`Excluir "${at.nome}"?`)) return;
      excluirAtividadesIds([at.id]);
      return;
    }

    // Coletar cadeia completa
    const cadeia: { at: Atividade; pav: PavComAtiv; mesmoLote: boolean }[] = [];

    // vinculo_ordem da atividade sendo excluída
    const ordemAtual = at.vinculo_ordem ?? 0;

    pavimentosExibidos.forEach(pav => {
      pav.atividades.forEach(a => {
        if (a.vinculo_id === vinculoId && a.id !== at.id) {
          // "mesmo lote" = criada junto (ordem contígua) vs vinculada manualmente depois
          const mesmoLote = Math.abs((a.vinculo_ordem ?? 0) - ordemAtual) === 1
            || a.nome === at.nome; // mesmo nome = criada em cascata
          cadeia.push({ at: a, pav, mesmoLote });
        }
      });
    });

    cadeia.sort((a, b) => (a.at.vinculo_ordem ?? 0) - (b.at.vinculo_ordem ?? 0));
    setModalEditar(null);
    setModalExcluirAt({ at, cadeia, vinculoId });
  };

  const excluirAtividadesIds = async (ids: number[], desvinculaIds?: number[]) => {
    setExcluindoAtModal(true);
    try {
      for (const id of ids) {
        await supabase.from('subatividades').delete().eq('atividade_id', id);
        await supabase.from('atividades').delete().eq('id', id);
        removerAtividadeLocal(id);
      }
      // Só desvincula se explicitamente passado (lista não-vazia)
      if (desvinculaIds && desvinculaIds.length > 0) {
        for (const id of desvinculaIds) {
          await supabase.from('atividades').update({ vinculo_id: null, vinculo_ordem: null }).eq('id', id);
          atualizarAtividadeLocal(id, { vinculo_id: null, vinculo_ordem: null });
        }
      }
      setModalExcluirAt(null);
      setMensagem({ tipo: 'success', texto: `✅ ${ids.length} atividade(s) excluída(s)!` });
      setTimeout(() => setMensagem(null), 3000);
    } finally {
      setExcluindoAtModal(false);
    }
  };

  // ─── Quebrar vínculo ───
  const handleQuebrarVinculo = async () => {
    if (!modalEditar?.at.vinculo_id) return;
    await supabase.from('atividades').update({ vinculo_id: null, vinculo_ordem: null, vinculo_lag: null }).eq('id', modalEditar.at.id);
    // Atualizar local
    atualizarAtividadeLocal(modalEditar.at.id, { vinculo_id: null, vinculo_ordem: null, vinculo_lag: null });
    setModalEditar(prev => prev ? { ...prev, at: { ...prev.at, vinculo_id: null, vinculo_ordem: null, vinculo_lag: null } } : null);
    setMensagem({ tipo: 'success', texto: '✅ Vínculo quebrado!' });
    setTimeout(() => setMensagem(null), 3000);
  };

  // ─── Reativar vínculo ───
  const [modalVincular, setModalVincular] = useState<{at: Atividade} | null>(null);

  const handleReativarVinculo = async (atAlvo: Atividade, comoAntecessora = false) => {
    if (!modalEditar) return;
    const atOrigem = modalEditar.at; // atividade que está sendo vinculada

    // Coletar cadeias envolvidas
    const cadeiaAlvo = atAlvo.vinculo_id
      ? pavimentosExibidos.flatMap(p => p.atividades).filter(a => a.vinculo_id === atAlvo.vinculo_id)
        .sort((a, b) => (a.vinculo_ordem ?? 0) - (b.vinculo_ordem ?? 0))
      : [atAlvo];

    const cadeiaOrigem = atOrigem.vinculo_id
      ? pavimentosExibidos.flatMap(p => p.atividades).filter(a => a.vinculo_id === atOrigem.vinculo_id)
        .sort((a, b) => (a.vinculo_ordem ?? 0) - (b.vinculo_ordem ?? 0))
      : [atOrigem];

    // Determinar posição de inserção na cadeia-alvo
    const idxAlvoNaCadeia = cadeiaAlvo.findIndex(a => a.id === atAlvo.id);

    // comoAntecessora: inserir cadeiaOrigem ANTES de atAlvo
    // comoSucessora (padrão): inserir cadeiaOrigem APÓS atAlvo
    const novaCadeia = comoAntecessora
      ? [...cadeiaAlvo.slice(0, idxAlvoNaCadeia), ...cadeiaOrigem, ...cadeiaAlvo.slice(idxAlvoNaCadeia)]
      : [...cadeiaAlvo.slice(0, idxAlvoNaCadeia + 1), ...cadeiaOrigem, ...cadeiaAlvo.slice(idxAlvoNaCadeia + 1)];

    // Usar o vinculo_id da cadeiaAlvo (ou criar novo se nenhuma tem)
    const vinculoId = atAlvo.vinculo_id || atOrigem.vinculo_id || gerarUUID();

    // Salvar nova ordem no banco
    for (let i = 0; i < novaCadeia.length; i++) {
      const lagAkt = novaCadeia[i].vinculo_lag ?? 0;
      await supabase.from('atividades')
        .update({ vinculo_id: vinculoId, vinculo_ordem: i, vinculo_lag: lagAkt })
        .eq('id', novaCadeia[i].id);
      atualizarAtividadeLocal(novaCadeia[i].id, { vinculo_id: vinculoId, vinculo_ordem: i, vinculo_lag: lagAkt });
    }

    setModalVincular(null);
    setModalEditar(null);
    setMensagem({ tipo: 'success', texto: `✅ Vínculo criado! Cadeia com ${novaCadeia.length} atividades.` });
    setTimeout(() => setMensagem(null), 4000);
  };

  // ─── Dependências externas CRUD ───
  const handleAdicionarDependencia = async (predecessoraId: number, lag: number) => {
    if (!modalAdicionarDep) return;
    const sucId = modalAdicionarDep.at.id;
    const { data, error } = await supabase.from('dependencias')
      .insert({ predecessora_id: predecessoraId, sucessora_id: sucId, lag_dias: lag })
      .select().single();
    if (!error && data) {
      setDependencias(prev => [...prev, data as Dependencia]);
    }
    setModalAdicionarDep(null);
  };

  const handleRemoverDependencia = async (depId: string) => {
    await supabase.from('dependencias').delete().eq('id', depId);
    setDependencias(prev => prev.filter(d => d.id !== depId));
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
    const doBloco = (pavData || []).filter((p: Pavimento) => p.nome === editandoBloco.blocoNome || p.nome.startsWith(`${editandoBloco.blocoNome} - `));
    const primeiro = doBloco.find((p: Pavimento) => p.observacao?.startsWith(PREFIXO_META));
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

  const [hoverAtividadeId, setHoverAtividadeId] = useState<number | null>(null);
  const { linhasVinculo, linhasDependencias } = useVinculos(
    pavimentosExibidos, hoverVinculo, dataMin, totalDias, dependencias, hoverAtividadeId,
  );
  const totalAtividades = pavimentosExibidos.reduce((acc, p) => acc + p.atividades.length, 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div><p className="text-slate-500">Carregando...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" onContextMenu={e => e.preventDefault()}>
      <HeaderLinhaBalanco
        obraNome={obra?.nome}
        versaoAtual={versaoAtual}
        modoLeitura={modoLeitura}
        modoRascunho={modoRascunho}
        isDirty={isDirty}
        totalPavimentos={pavimentos.length}
        totalAtividades={totalAtividades}
        totalDias={totalDias}
        onVoltar={() => navegarComGuarda(`/obras/${obraId}`)}
        onHistorico={() => setModalHistorico(true)}
        onSalvarVersao={() => setModalVersao(true)}
        onDashboard={() => navegarComGuarda(`/obras/${obraId}/dashboard`)}
      />

      <main className="max-w-full px-6 py-6">
        <BannersLinhaBalanco
          modoLeitura={modoLeitura}
          modoRascunho={modoRascunho}
          versaoAtual={versaoAtual}
          mensagem={mensagem}
          onIniciarRascunho={iniciarRascunho}
          onHistorico={() => setModalHistorico(true)}
          onSalvarVersao={() => setModalVersao(true)}
          onDescartarRascunho={() => {
            if (isDirty && !confirm('Descartar edições do rascunho?')) return;
            setSnapshotBase(null);
            limparDirty();
          }}
        />

        <ToolbarSuperior
          zoomInicio={zoomInicio} zoomFim={zoomFim}
          setZoomInicio={setZoomInicio} setZoomFim={setZoomFim}
          pavimentosFiltro={pavimentosFiltro}
          totalPavimentos={pavimentosExibidos.length}
          onAbrirFiltros={() => setModalFiltros(true)}
          onImprimir={handleImprimir}
          mostrarAvancoReal={mostrarAvancoReal}
          onToggleAvancoReal={() => setMostrarAvancoReal(v => !v)}
        />

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
              return (
                <GraficoLinhaBalanco
                  pavimentosFiltrados={pavimentosFiltrados}
                  diasCalendario={diasCalendario}
                  dataMin={dataMin}
                  totalDias={totalDias}
                  pxPorDia={pxPorDia}
                  feriadosSet={feriadosSet}
                  sabadoUtil={sabadoUtil}
                  domingoUtil={domingoUtil}
                  modoInterativo
                  drag={drag}
                  conflitos={conflitos}
                  hoverVinculo={hoverVinculo}
                  linhasVinculo={linhasVinculo}
                  linhasDependencias={linhasDependencias}
                  graficoRef={graficoRef}
                  modoLeitura={modoLeitura}
                  atualizando={atualizando}
                  onContextMenu={handleContextMenu}
                  onContextMenuAt={handleContextMenuAt}
                  onMouseDown={handleMouseDown}
                  onMouseEnterAt={(e, at, pav) => {
                    if (!drag) {
                      setTooltip({ at, pav, x: e.clientX, y: e.clientY });
                      if (at.vinculo_id) setHoverVinculo(at.vinculo_id);
                      setHoverAtividadeId(at.id);
                    }
                  }}
                  onMouseLeaveAt={() => {
                    if (!drag) { setTooltip(null); setHoverVinculo(null); setHoverAtividadeId(null); }
                  }}
                  onEditarBloco={(blocoNome, linhasAtuais) => {
                    if (modoLeitura) {
                      setMensagem({ tipo: 'error', texto: '🔒 Versão Definitiva é somente leitura.' });
                      setTimeout(() => setMensagem(null), 3000);
                      return;
                    }
                    abrirEditarBloco(blocoNome, linhasAtuais);
                  }}
                  mostrarAvancoReal={mostrarAvancoReal}
                  progrealPorAtividade={progrealPorAtividade}
                />
              );
            })()}
          </div>
        </div>

        {/* Legenda — após o gráfico */}
        <LegendaCores coresCache={coresCache} />

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
        <ContextMenu
          ctxMenu={ctxMenu}
          onCriar={abrirCriar}
          onEditar={abrirEditar}
          onGerenciarVinculo={() => { setModalVincular(null); abrirEditar(); }}
        />
      )}

      {tooltip && !ctxMenu && (
        <TooltipAtividade tooltip={tooltip} conflitos={conflitos} />
      )}

      {/* ─── Modal Criar Atividade ─── */}
      {modalCriar && (
        <ModalCriarAtividade
          modalCriar={modalCriar}
          formCriar={formCriar} setFormCriar={setFormCriar}
          subsCriar={subsCriar} setSubsCriar={setSubsCriar}
          usarSubs={usarSubs} setUsarSubs={setUsarSubs}
          replicar={replicar} setReplicar={setReplicar}
          vincular={vincular} setVincular={setVincular}
          pavSelecionados={pavSelecionados} setPavSelecionados={setPavSelecionados}
          criando={criando}
          pavimentosDoBloco={pavimentosDoBloco}
          calcDataFimUtil={calcDataFimUtil}
          calcInicioUtil={calcInicioUtil}
          feriadosSet={feriadosSet}
          sabadoUtil={sabadoUtil}
          domingoUtil={domingoUtil}
          onCriar={handleCriar}
          onCancelar={() => setModalCriar(null)}
        />
      )}

      {/* ─── Modal Editar Atividade ─── */}
      {modalEditar && (
        <ModalEditarAtividade
          modalEditar={modalEditar}
          formEditar={formEditar} setFormEditar={setFormEditar}
          subsEditar={subsEditar} setSubsEditar={setSubsEditar}
          salvandoEdicao={salvandoEdicao}
          excluindoAt={excluindoAtModal}
          calcDataFimUtil={calcDataFimUtil}
          handleQuebrarVinculo={handleQuebrarVinculo}
          setModalVincular={setModalVincular}
          handleSalvarEdicao={handleSalvarEdicao}
          abrirExcluirAtividade={abrirExcluirAtividade}
          onCancelar={() => setModalEditar(null)}
          dependencias={dependencias}
          pavimentosExibidos={pavimentosExibidos}
          handleRemoverDependencia={handleRemoverDependencia}
          setModalAdicionarDep={setModalAdicionarDep}
        />
      )}

      {/* ─── Modal Adicionar Dependência Externa ─── */}
      {modalAdicionarDep && (
        <ModalAdicionarDependencia
          modalAdicionarDep={modalAdicionarDep}
          pavimentosExibidos={pavimentosExibidos}
          dependencias={dependencias}
          onConfirmar={handleAdicionarDependencia}
          onCancelar={() => setModalAdicionarDep(null)}
        />
      )}

      {/* ─── Modal Reativar Vínculo ─── */}
      {modalVincular && (
        <ModalVincular
          modalVincular={modalVincular}
          pavimentosExibidos={pavimentosExibidos}
          handleReativarVinculo={handleReativarVinculo}
          onCancelar={() => setModalVincular(null)}
        />
      )}

      {/* ─── Modal Filtros de Pavimentos ─── */}
      {modalFiltros && (
        <ModalFiltros
          pavimentosExibidos={pavimentosExibidos}
          pavimentosFiltro={pavimentosFiltro}
          setPavimentosFiltro={setPavimentosFiltro}
          onFechar={() => setModalFiltros(false)}
        />
      )}

      {telaCheia && (
        <TelaCheia
          obraNome={obra?.nome}
          dataMin={dataMin}
          totalDias={totalDias}
          zoomInicio={zoomInicio} zoomFim={zoomFim}
          setZoomInicio={setZoomInicio} setZoomFim={setZoomFim}
          pavimentosFiltro={pavimentosFiltro}
          coresCache={coresCache}
          pavimentosFiltrados={pavimentosFiltrados}
          diasCalendario={diasCalendario}
          feriadosSet={feriadosSet}
          sabadoUtil={sabadoUtil}
          domingoUtil={domingoUtil}
          onAbrirFiltros={() => setModalFiltros(true)}
          onImprimir={handleImprimir}
          onFechar={() => setTelaCheia(false)}
        />
      )}

      {/* ─── Modal Excluir Atividade com Vínculo ─── */}
      {modalExcluirAt && (
        <ModalExcluirComVinculo
          modalExcluirAt={modalExcluirAt}
          excluindoAtModal={excluindoAtModal}
          pavimentosExibidos={pavimentosExibidos}
          excluirAtividadesIds={excluirAtividadesIds}
          onCancelar={() => setModalExcluirAt(null)}
        />
      )}

      {/* ─── Modal Editar Linhas ─── */}
      {editandoBloco && (
        <ModalEditarLinhas
          editandoBloco={editandoBloco}
          setEditandoBloco={setEditandoBloco}
          salvandoLinhas={salvandoLinhas}
          calcularConflitosReducao={calcularConflitosReducao}
          handleSalvarLinhas={handleSalvarLinhas}
        />
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
        <ModalSaida
          onSalvar={() => { setModalSaida(null); setModalVersao(true); }}
          onDescartar={() => { const d = modalSaida.destino; setModalSaida(null); limparDirty(); if (d) router.push(d); }}
          onContinuar={() => setModalSaida(null)}
        />
      )}

      {/* ─── Modal Salvar Versão ─── */}
      {modalVersao && (
        <ModalSalvarVersao
          formVersao={formVersao}
          setFormVersao={setFormVersao}
          versoes={versoes}
          modoRascunho={modoRascunho}
          versaoAtual={versaoAtual}
          salvandoVersao={salvandoVersao}
          pavimentos={pavimentos}
          totalAtividades={totalAtividades}
          handleSalvarVersao={handleSalvarVersao}
          onCancelar={() => { setModalVersao(false); setFormVersao({ nome: '', descricao: '', status: 'Em Atualização', sobrescreverVersaoId: null, erroNome: '' }); }}
        />
      )}

      {/* ─── Modal Histórico de Versões ─── */}
      {modalHistorico && (
        <ModalHistoricoVersoes
          versoes={versoes}
          versaoAtual={versaoAtual}
          isDirty={isDirty}
          modoLeitura={modoLeitura}
          destinoPendente={destinoPendente}
          setModalHistorico={setModalHistorico}
          setModalVersao={setModalVersao}
          setModalSaida={setModalSaida}
          setVersaoAtual={setVersaoAtual}
          limparDirty={limparDirty}
          handleExcluirVersao={handleExcluirVersao}
        />
      )}
    </div>
  );
}
