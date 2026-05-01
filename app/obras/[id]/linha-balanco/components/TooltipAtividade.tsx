import type { Atividade, PavComAtiv } from '@/app/lib/types';
import { parseDate, diffDias } from '@/app/calendario';
import { getCorSub } from '../utils/geradorCores';
import { fmtDate } from '../utils/helpers';

interface ConflitosState {
  set: Set<number>;
  motivoConflito: Record<number, string>;
}

interface TooltipState {
  at: Atividade;
  pav: PavComAtiv;
  x: number;
  y: number;
}

interface Props {
  tooltip: TooltipState;
  conflitos: ConflitosState;
}

export function TooltipAtividade({ tooltip, conflitos }: Props) {
  const { at, pav, x, y } = tooltip;
  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 pointer-events-none"
      style={{ left: x + 16, top: y - 80, minWidth: 240, maxWidth: 320 }}
    >
      <p className="font-bold text-slate-900 mb-2">{at.nome}</p>
      <div className="space-y-1 text-sm text-slate-600">
        <p>🏢 {pav.nome}</p>
        <p>📅 {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</p>
        <p>⏱️ {diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1} dias</p>
        {at.equipe && (at.subatividades?.length ?? 0) === 0 && (
          <p>👥 {at.equipe}
            {at.efetivo ? <span className="ml-2 font-semibold text-blue-600">· {at.efetivo} func.</span> : null}
          </p>
        )}
        {at.vinculo_id && <p className="text-blue-600 font-semibold">🔗 Vinculada</p>}
        {conflitos.set.has(at.id) && (
          <p className="text-red-600 font-semibold text-xs mt-1">
            ⚠️ {conflitos.motivoConflito[at.id] || 'Conflito detectado'}
          </p>
        )}
      </div>
      {(at.subatividades?.length ?? 0) > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">Subatividades:</p>
          <div className="space-y-1">
            {at.subatividades!.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: s.cor || getCorSub(at.nome, i) }}></div>
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
  );
}
