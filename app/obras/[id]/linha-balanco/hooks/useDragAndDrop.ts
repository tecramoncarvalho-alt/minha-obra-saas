import { useState, useEffect, useCallback } from 'react';
import { parseDate, toStr, addDias, diffDias } from '@/app/calendario';
import type { Atividade, PavComAtiv, Dependencia } from '@/app/lib/types';
import { createClient } from '@/lib/supabase/client';

const ALTURA_LINHA = 44;
const LARGURA_NOME = 172;

type Supabase = ReturnType<typeof createClient>;

interface DragState {
  at: Atividade; pav: PavComAtiv;
  startX: number; startDia: number;
  startY: number; startLinha: number;
  deltaDias: number; deltaLinha: number;
}

function addDiasUteisLocal(data: Date, dias: number, fs: Set<string>, su: boolean, du: boolean): Date {
  const r = new Date(data);
  let restante = Math.abs(dias);
  const dir = dias >= 0 ? 1 : -1;
  while (restante > 0) {
    r.setDate(r.getDate() + dir);
    const dia = r.getDay();
    const s = toStr(r);
    if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) restante--;
  }
  return r;
}

interface Params {
  dataMin: Date;
  totalDias: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  modoLeitura: boolean;
  supabase: Supabase;
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
  calcDataFimUtil: (inicio: Date, duracaoDias: number) => Date;
  propagarVinculoLocal: (vinculoId: string, atOrigemId: number, deltaDias: number) => void;
  propagarDependenciasLocal: (atMovidaId: number, novoFim: string, deps: Dependencia[], vinculoId?: string | null) => void;
  atualizarAtividadeLocal: (atId: number, campos: Partial<Atividade>) => void;
  atualizarSnapshotVersaoAtiva: (pavs: PavComAtiv[]) => Promise<void>;
  setMensagem: (m: { tipo: 'success' | 'error'; texto: string } | null) => void;
  setTooltip: (t: { at: Atividade; pav: PavComAtiv; x: number; y: number } | null) => void;
  setAtualizando: (v: boolean) => void;
  setCtxMenu: (v: null) => void;
  pavimentos: PavComAtiv[];
  dependencias: Dependencia[];
}

export function useDragAndDrop({
  dataMin, totalDias, containerRef, modoLeitura, supabase,
  feriadosSet, sabadoUtil, domingoUtil, calcDataFimUtil,
  propagarVinculoLocal, propagarDependenciasLocal, atualizarAtividadeLocal, atualizarSnapshotVersaoAtiva,
  setMensagem, setTooltip, setAtualizando, setCtxMenu, pavimentos, dependencias,
}: Params) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const ppd = useCallback(() => {
    if (!containerRef.current) return 10;
    return (containerRef.current.offsetWidth - LARGURA_NOME) / totalDias;
  }, [containerRef, totalDias]);

  const propagarVinculo = useCallback(async (
    atOrigem: Atividade, deltaDias: number, novaLinha: number,
    novoInicio: Date, novoFim: Date,
  ) => {
    if (!atOrigem.vinculo_id) return;

    const { data: cadeia } = await supabase
      .from('atividades').select('*')
      .eq('vinculo_id', atOrigem.vinculo_id)
      .order('vinculo_ordem');
    if (!cadeia) return;

    await supabase.from('atividades').update({
      data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha,
    }).eq('id', atOrigem.id);

    let refFim = novoFim;
    for (const item of cadeia) {
      if (item.id === atOrigem.id) continue;
      if ((item.vinculo_ordem ?? 0) <= (atOrigem.vinculo_ordem ?? 0)) continue;

      const durUtil = item.duracao_dias ?? (diffDias(parseDate(item.data_inicio), parseDate(item.data_fim)) + 1);
      const lag = (item.vinculo_lag ?? 0);
      const novaData = addDiasUteisLocal(refFim, 1 + lag, feriadosSet, sabadoUtil, domingoUtil);
      const novaDataFim = calcDataFimUtil(novaData, durUtil);

      await supabase.from('atividades').update({
        data_inicio: toStr(novaData), data_fim: toStr(novaDataFim),
      }).eq('id', item.id);

      refFim = novaDataFim;
    }
  }, [supabase, feriadosSet, sabadoUtil, domingoUtil, calcDataFimUtil]);

  const propagarVinculoCruzadoAsync = useCallback(async (
    atMovidaId: number,
    novoFim: string,
    vinculoId: string | null,
  ) => {
    const movidasComFim: { id: number; fim: string }[] = [];

    if (vinculoId) {
      // propagarVinculo já gravou datas atualizadas no banco — buscar de lá
      const { data: cadeia } = await supabase.from('atividades')
        .select('id, data_fim, vinculo_ordem')
        .eq('vinculo_id', vinculoId)
        .order('vinculo_ordem');
      if (cadeia) {
        const atOrigem = cadeia.find((a: { id: number; vinculo_ordem: number }) => a.id === atMovidaId);
        const ordemOrigem = atOrigem?.vinculo_ordem ?? 0;
        cadeia
          .filter((a: { id: number; vinculo_ordem: number; data_fim: string }) => (a.vinculo_ordem ?? 0) >= ordemOrigem)
          .forEach((at: { id: number; data_fim: string }) => movidasComFim.push({ id: at.id, fim: at.data_fim }));
      }
    } else {
      movidasComFim.push({ id: atMovidaId, fim: novoFim });
    }

    for (const movida of movidasComFim) {
      const deps = dependencias.filter(d => d.predecessora_id === movida.id);
      for (const dep of deps) {
        const newFimDate = parseDate(movida.fim);
        const lag = dep.lag_dias ?? 0;
        const newInicio = addDiasUteisLocal(newFimDate, 1 + lag, feriadosSet, sabadoUtil, domingoUtil);

        const { data: sucData } = await supabase.from('atividades')
          .select('*').eq('id', dep.sucessora_id).single();
        if (!sucData) continue;
        const durUtil = sucData.duracao_dias ?? 1;
        const newFimSuc = calcDataFimUtil(newInicio, durUtil);

        await supabase.from('atividades').update({
          data_inicio: toStr(newInicio), data_fim: toStr(newFimSuc),
        }).eq('id', dep.sucessora_id);

        if (sucData.vinculo_id) {
          await propagarVinculo(
            { ...sucData, data_inicio: toStr(newInicio), data_fim: toStr(newFimSuc) } as Atividade,
            0, sucData.linha_index ?? 0, newInicio, newFimSuc,
          );
        }
      }
    }
  }, [dependencias, feriadosSet, sabadoUtil, domingoUtil, calcDataFimUtil, supabase, propagarVinculo]);

  const handleMouseDown = useCallback((e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => {
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
  }, [modoLeitura, setMensagem, setCtxMenu, dataMin]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const d = Math.round((e.clientX - drag.startX) / ppd());
      const dl = Math.max(0, Math.min(drag.pav.numLinhas - 1, drag.startLinha + Math.round((e.clientY - drag.startY) / ALTURA_LINHA))) - drag.startLinha;
      setDrag(prev => prev ? { ...prev, deltaDias: d, deltaLinha: dl } : null);
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

      if (modoLeitura) { setDrag(null); setTooltip(null); return; }

      setAtualizando(true);
      const novoInicio = addDias(parseDate(drag.at.data_inicio), deltaDias);
      const duracaoUtil = drag.at.duracao_dias ?? (diffDias(parseDate(drag.at.data_inicio), parseDate(drag.at.data_fim)) + 1);
      const novoFim = calcDataFimUtil(novoInicio, duracaoUtil);

      if (drag.at.vinculo_id && deltaDias !== 0) {
        propagarVinculoLocal(drag.at.vinculo_id, drag.at.id, deltaDias);
        if (novaLinha !== drag.startLinha) {
          atualizarAtividadeLocal(drag.at.id, { linha_index: novaLinha });
        }
        await propagarVinculo(drag.at, deltaDias, novaLinha, novoInicio, novoFim);
      } else {
        atualizarAtividadeLocal(drag.at.id, {
          data_inicio: toStr(novoInicio),
          data_fim: toStr(novoFim),
          linha_index: novaLinha,
        });
        await supabase.from('atividades').update({
          data_inicio: toStr(novoInicio), data_fim: toStr(novoFim), linha_index: novaLinha,
        }).eq('id', drag.at.id);
      }

      // Propagar dependências cruzadas (chain-aware: todos os membros da cadeia que moveram)
      propagarDependenciasLocal(drag.at.id, toStr(novoFim), dependencias, drag.at.vinculo_id ?? null);
      await propagarVinculoCruzadoAsync(drag.at.id, toStr(novoFim), drag.at.vinculo_id ?? null);

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
  }, [drag, ppd, modoLeitura, calcDataFimUtil, propagarVinculo, propagarVinculoLocal, propagarDependenciasLocal, propagarVinculoCruzadoAsync, atualizarAtividadeLocal, atualizarSnapshotVersaoAtiva, setMensagem, setTooltip, setAtualizando, supabase, pavimentos, dependencias]);

  return { drag, setDrag, handleMouseDown };
}
