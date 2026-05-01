import type { Atividade, PavComAtiv } from '@/app/lib/types';

interface CtxMenuState {
  x: number;
  y: number;
  tipo: 'vazio' | 'atividade';
  pav?: PavComAtiv;
  diaClicado?: number;
  linhaClicada?: number;
  at?: Atividade;
}

interface Props {
  ctxMenu: CtxMenuState;
  onCriar: () => void;
  onEditar: () => void;
  onGerenciarVinculo: () => void;
}

export function ContextMenu({ ctxMenu, onCriar, onEditar, onGerenciarVinculo }: Props) {
  return (
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
          <button onClick={onCriar}
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
          <button onClick={onEditar}
            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
            ✏️ Editar atividade
          </button>
          {ctxMenu.at?.vinculo_id && (
            <button onClick={onGerenciarVinculo}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-yellow-50 hover:text-yellow-700 flex items-center gap-2">
              🔗 Gerenciar vínculo
            </button>
          )}
        </>
      )}
    </div>
  );
}
