import { useMemo } from 'react';
import { parseDate, diffDias } from '@/app/calendario';
import type { Atividade, PavComAtiv } from '@/app/lib/types';

const ALTURA_LINHA = 44;

export function useVinculos(
  pavimentosExibidos: PavComAtiv[],
  hoverVinculo: string | null,
  dataMin: Date,
  totalDias: number,
) {
  const atividadesVinculadas = useMemo(() => {
    const map: Record<string, number[]> = {};
    pavimentosExibidos.forEach(p => p.atividades.forEach(a => {
      if (a.vinculo_id) {
        if (!map[a.vinculo_id]) map[a.vinculo_id] = [];
        map[a.vinculo_id].push(a.id);
      }
    }));
    return map;
  }, [pavimentosExibidos]);

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

  return { atividadesVinculadas, linhasVinculo };
}
