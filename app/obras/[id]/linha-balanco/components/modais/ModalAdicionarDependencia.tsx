import { useState } from 'react';
import type { Atividade, PavComAtiv, Dependencia } from '@/app/lib/types';
import { fmtDate } from '../../utils/helpers';

interface Props {
  modalAdicionarDep: { at: Atividade };
  pavimentosExibidos: PavComAtiv[];
  dependencias: Dependencia[];
  onConfirmar: (predecessoraId: number, lag: number) => Promise<void>;
  onCancelar: () => void;
}

export function ModalAdicionarDependencia({
  modalAdicionarDep, pavimentosExibidos, dependencias, onConfirmar, onCancelar,
}: Props) {
  const [lagInput, setLagInput] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const at = modalAdicionarDep.at;

  const predsExistentes = new Set(
    dependencias.filter(d => d.sucessora_id === at.id).map(d => d.predecessora_id)
  );
  const sucsDiretas = new Set(
    dependencias.filter(d => d.predecessora_id === at.id).map(d => d.sucessora_id)
  );

  const candidatas = pavimentosExibidos.flatMap(pav =>
    pav.atividades
      .filter(a =>
        a.id !== at.id &&
        !predsExistentes.has(a.id) &&
        !sucsDiretas.has(a.id) &&
        (at.vinculo_id === null || a.vinculo_id !== at.vinculo_id)
      )
      .map(a => ({ at: a, pav }))
  );

  const handleClick = async (candId: number) => {
    if (salvando) return;
    setSalvando(true);
    await onConfirmar(candId, lagInput);
    setSalvando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-1">🔀 Adicionar Dependência Externa</h3>
        <p className="text-xs text-slate-500 mb-3">
          Selecione a atividade que deve <strong>terminar antes</strong> de{' '}
          <span className="text-amber-600 font-semibold">&quot;{at.nome}&quot;</span> começar.
        </p>

        <div className="flex items-center gap-2 mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <label className="text-xs text-amber-700 font-semibold whitespace-nowrap">⏱️ Intervalo (dias úteis):</label>
          <input
            type="number"
            value={lagInput}
            onChange={e => setLagInput(parseInt(e.target.value) || 0)}
            disabled={salvando}
            className="w-20 px-2 py-1 border border-amber-300 rounded text-sm text-center outline-none focus:ring-1 focus:ring-amber-400"
          />
          <span className="text-xs text-amber-600">
            {lagInput < 0 ? 'sobreposição' : lagInput === 0 ? 'sem folga' : 'folga'}
          </span>
        </div>

        <div className="overflow-y-auto flex-1 space-y-1">
          {candidatas.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              Nenhuma atividade disponível para vincular.
            </p>
          )}
          {candidatas.map(({ at: cand, pav }) => (
            <button
              type="button"
              key={cand.id}
              disabled={salvando}
              onClick={() => handleClick(cand.id)}
              className="w-full text-left p-3 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cand.nome}</p>
                  <p className="text-xs text-slate-500">
                    {pav.nome} · {fmtDate(cand.data_inicio)} → {fmtDate(cand.data_fim)}
                    {cand.vinculo_id && <span className="ml-1 text-purple-500">🔗 em cadeia</span>}
                  </p>
                </div>
                <span className="text-xs text-amber-500 ml-2 flex-shrink-0">
                  {salvando ? '⏳' : '← predecessora'}
                </span>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="w-full mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 flex-shrink-0 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
