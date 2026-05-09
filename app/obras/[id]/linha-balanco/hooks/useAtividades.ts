import { useCallback } from 'react';
import { parseDate, toStr, addDias, diffDias } from '@/app/calendario';
import type { Atividade, PavComAtiv, Subatividade, Dependencia } from '@/app/lib/types';
import { getCorSub } from '../utils/geradorCores';

interface CalendarioRef {
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
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

export function useAtividades(
  setPavimentos: React.Dispatch<React.SetStateAction<PavComAtiv[]>>,
  marcarDirty: () => void,
  calendarioRef: React.MutableRefObject<CalendarioRef>,
  calcDataFimUtil: (inicio: Date, duracaoDias: number) => Date,
) {
  const atualizarAtividadeLocal = useCallback((atId: number, campos: Partial<Atividade>) => {
    setPavimentos(prev => prev.map(pav => ({
      ...pav,
      atividades: pav.atividades.map(at => at.id === atId ? { ...at, ...campos } : at),
    })));
    marcarDirty();
  }, [setPavimentos, marcarDirty]);

  const adicionarAtividadeLocal = useCallback((pavId: number, novaAt: Atividade) => {
    setPavimentos(prev => prev.map(pav =>
      pav.id === pavId ? { ...pav, atividades: [...pav.atividades, novaAt] } : pav
    ));
    marcarDirty();
  }, [setPavimentos, marcarDirty]);

  const removerAtividadeLocal = useCallback((atId: number) => {
    setPavimentos(prev => prev.map(pav => ({
      ...pav,
      atividades: pav.atividades.filter(at => at.id !== atId),
    })));
    marcarDirty();
  }, [setPavimentos, marcarDirty]);

  const atualizarSubatividadesLocal = useCallback((atId: number, novasSubs: Subatividade[]) => {
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
  }, [setPavimentos, marcarDirty]);

  const propagarVinculoLocal = useCallback((vinculoId: string, atOrigemId: number, deltaDias: number) => {
    setPavimentos(prev => {
      const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;

      const cadeia: Atividade[] = [];
      prev.forEach(pav => pav.atividades.forEach(at => {
        if (at.vinculo_id === vinculoId) cadeia.push(at);
      }));
      cadeia.sort((a, b) => (a.vinculo_ordem ?? 0) - (b.vinculo_ordem ?? 0));

      const idxOrigem = cadeia.findIndex(a => a.id === atOrigemId);
      if (idxOrigem < 0) return prev;

      const novasDatas: Record<number, { inicio: string; fim: string }> = {};
      for (let i = idxOrigem; i < cadeia.length; i++) {
        const at = cadeia[i];
        const durUtil = at.duracao_dias ?? (diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1);
        if (i === idxOrigem) {
          const ni = addDias(parseDate(at.data_inicio), deltaDias);
          novasDatas[at.id] = { inicio: toStr(ni), fim: toStr(calcDataFimUtil(ni, durUtil)) };
        } else {
          const antFim = parseDate(novasDatas[cadeia[i - 1].id].fim);
          const lag = cadeia[i].vinculo_lag ?? 0;
          const ni = addDiasUteisLocal(antFim, 1 + lag, fs, su, du);
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
  }, [setPavimentos, marcarDirty, calendarioRef, calcDataFimUtil]);

  const propagarDependenciasLocal = useCallback((
    atMovidaId: number,
    novoFim: string,
    dependencias: Dependencia[],
  ) => {
    const deps = dependencias.filter(d => d.predecessora_id === atMovidaId);
    if (deps.length === 0) return;

    setPavimentos(prev => {
      const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
      const novasDatas: Record<number, { inicio: string; fim: string }> = {};

      for (const dep of deps) {
        let sucAt: Atividade | undefined;
        for (const pav of prev) {
          const found = pav.atividades.find(a => a.id === dep.sucessora_id);
          if (found) { sucAt = found; break; }
        }
        if (!sucAt) continue;

        const newFimDate = parseDate(novoFim);
        const lag = dep.lag_dias ?? 0;
        const newInicio = addDiasUteisLocal(newFimDate, 1 + lag, fs, su, du);
        const durUtil = sucAt.duracao_dias ?? 1;
        const newFimSuc = calcDataFimUtil(newInicio, durUtil);
        novasDatas[sucAt.id] = { inicio: toStr(newInicio), fim: toStr(newFimSuc) };

        if (sucAt.vinculo_id) {
          const cadeia: Atividade[] = [];
          prev.forEach(pav => pav.atividades.forEach(at => {
            if (at.vinculo_id === (sucAt as Atividade).vinculo_id) cadeia.push(at);
          }));
          cadeia.sort((a, b) => (a.vinculo_ordem ?? 0) - (b.vinculo_ordem ?? 0));
          const idxSuc = cadeia.findIndex(a => a.id === (sucAt as Atividade).id);
          let refFim = newFimSuc;
          for (let i = idxSuc + 1; i < cadeia.length; i++) {
            const at = cadeia[i];
            const lag2 = at.vinculo_lag ?? 0;
            const ni = addDiasUteisLocal(refFim, 1 + lag2, fs, su, du);
            const nf = calcDataFimUtil(ni, at.duracao_dias ?? 1);
            novasDatas[at.id] = { inicio: toStr(ni), fim: toStr(nf) };
            refFim = nf;
          }
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
  }, [setPavimentos, marcarDirty, calendarioRef, calcDataFimUtil]);

  const atualizarNumLinhasBloco = useCallback((blocoNome: string, novasLinhas: number) => {
    setPavimentos(prev => prev.map(pav =>
      (pav.nome === blocoNome || pav.nome.startsWith(`${blocoNome} - `))
        ? { ...pav, numLinhas: novasLinhas }
        : pav
    ));
    marcarDirty();
  }, [setPavimentos, marcarDirty]);

  return {
    atualizarAtividadeLocal,
    adicionarAtividadeLocal,
    removerAtividadeLocal,
    atualizarSubatividadesLocal,
    propagarVinculoLocal,
    propagarDependenciasLocal,
    atualizarNumLinhasBloco,
  };
}
