import { useMemo } from 'react';
import { parseDate } from '@/app/calendario';
import type { PavComAtiv } from '@/app/lib/types';

export function useConflitos(pavimentosExibidos: PavComAtiv[]) {
  return useMemo(() => {
    const set = new Set<number>();
    const motivoConflito: Record<number, string> = {};

    const todas = pavimentosExibidos.flatMap((p, pavIdx) =>
      p.atividades.map(a => ({
        ...a,
        pavId: p.id,
        pavNome: p.nome,
        pavIdx,
      }))
    );

    for (let i = 0; i < todas.length; i++) {
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i], b = todas[j];
        const overlap = parseDate(a.data_inicio) <= parseDate(b.data_fim)
                     && parseDate(a.data_fim)    >= parseDate(b.data_inicio);
        if (!overlap) continue;

        if (a.equipe && b.equipe && a.equipe === b.equipe && a.pavId !== b.pavId) {
          set.add(a.id); set.add(b.id);
          motivoConflito[a.id] = `Equipe "${a.equipe}" também em ${b.pavNome}`;
          motivoConflito[b.id] = `Equipe "${b.equipe}" também em ${a.pavNome}`;
        }

        if (a.pavIdx === b.pavIdx && (a.linha_index ?? 0) === (b.linha_index ?? 0)) {
          set.add(a.id); set.add(b.id);
          motivoConflito[a.id] = `Sobrepõe "${b.nome}" na mesma linha`;
          motivoConflito[b.id] = `Sobrepõe "${a.nome}" na mesma linha`;
        }
      }
    }
    return { set, motivoConflito };
  }, [pavimentosExibidos]);
}
