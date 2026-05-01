import { useCallback } from 'react';
import { toStr } from '@/app/calendario';

interface CalendarioRef {
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
}

export function useCalendarioAtividades(calendarioRef: React.MutableRefObject<CalendarioRef>) {
  // calendarioRef is intentionally excluded from deps — it's a ref, stable by design
  const isDiaUtil = useCallback((data: Date): boolean => {
    const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
    const dia = data.getDay();
    const s = toStr(data);
    return !fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcInicioUtil = useCallback((data: Date): Date => {
    const r = new Date(data);
    while (!(() => {
      const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
      const dia = r.getDay(); const s = toStr(r);
      return !fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du);
    })()) r.setDate(r.getDate() + 1);
    return r;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcDataFimUtil = useCallback((inicio: Date, duracaoDias: number): Date => {
    const { feriadosSet: fs, sabadoUtil: su, domingoUtil: du } = calendarioRef.current;
    const r = new Date(inicio);
    while (true) {
      const dia = r.getDay(); const s = toStr(r);
      if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) break;
      r.setDate(r.getDate() + 1);
    }
    let restante = duracaoDias - 1;
    while (restante > 0) {
      r.setDate(r.getDate() + 1);
      const dia = r.getDay(); const s = toStr(r);
      if (!fs.has(s) && !(dia === 6 && !su) && !(dia === 0 && !du)) restante--;
    }
    return r;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isDiaUtil, calcInicioUtil, calcDataFimUtil, calcProximoInicioUtil };
}
