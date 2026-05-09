import { useState } from 'react';
import type { Atividade, PavComAtiv } from '@/app/lib/types';
import { fmtDate } from '../../utils/helpers';

interface Props {
  modalVincular: { at: Atividade };
  pavimentosExibidos: PavComAtiv[];
  handleReativarVinculo: (atAlvo: Atividade, comoAntecessora?: boolean) => void;
  onCancelar: () => void;
}

export function ModalVincular({ modalVincular, pavimentosExibidos, handleReativarVinculo, onCancelar }: Props) {
  const [comoAntecessora, setComoAntecessora] = useState(false);
  const ativsSemEsta = pavimentosExibidos.flatMap(pav =>
    pav.atividades
      .filter(a => a.id !== modalVincular.at.id &&
        !(modalVincular.at.vinculo_id && a.vinculo_id === modalVincular.at.vinculo_id)
      )
      .map(at => ({ at, pav }))
  );

  const comCadeia: typeof ativsSemEsta = [];
  const semCadeia: typeof ativsSemEsta = [];

  ativsSemEsta.forEach(item => {
    if (item.at.vinculo_id) comCadeia.push(item);
    else semCadeia.push(item);
  });

  const grupos: Record<string, typeof ativsSemEsta> = {};
  comCadeia.forEach(item => {
    const vid = item.at.vinculo_id!;
    if (!grupos[vid]) grupos[vid] = [];
    grupos[vid].push(item);
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-1">🔗 Vincular Manualmente</h3>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setComoAntecessora(false)}
            className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
              !comoAntecessora
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}>
            → Inserir como Sucessora
          </button>
          <button
            onClick={() => setComoAntecessora(true)}
            className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
              comoAntecessora
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}>
            ← Inserir como Antecessora
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-1">
          {comoAntecessora
            ? <>Selecione a atividade que deve <strong>suceder</strong> <span className="text-purple-600 font-semibold">&quot;{modalVincular.at.nome}&quot;</span></>
            : <>Selecione a atividade que deve <strong>preceder</strong> <span className="text-purple-600 font-semibold">&quot;{modalVincular.at.nome}&quot;</span></>
          }
        </p>
        {modalVincular.at.vinculo_id && (
          <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-3">
            ℹ️ Esta atividade já faz parte de uma cadeia — ela e seu grupo serão inseridos após a atividade selecionada
          </div>
        )}

        <div className="overflow-y-auto flex-1 space-y-2 mt-2">
          {semCadeia.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 px-1">Atividades independentes</p>
              {semCadeia.map(({ at, pav }) => (
                <button key={at.id} onClick={() => handleReativarVinculo(at, comoAntecessora)}
                  className="w-full text-left p-3 border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors mb-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{at.nome}</p>
                      <p className="text-xs text-slate-500">{pav.nome} · {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</p>
                    </div>
                    <span className="text-xs text-slate-400 ml-2">→ vincular</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {Object.entries(grupos).length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 px-1">Atividades em cadeia</p>
              {Object.entries(grupos).map(([vid, items]) => {
                const cadeia = items.sort((a, b) => (a.at.vinculo_ordem ?? 0) - (b.at.vinculo_ordem ?? 0));
                return (
                  <div key={vid} className="border border-purple-200 rounded-lg overflow-hidden mb-2">
                    <div className="bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 flex items-center gap-1">
                      🔗 Cadeia com {cadeia.length} atividades — clique onde deseja inserir após:
                    </div>
                    {cadeia.map(({ at, pav }, idx) => (
                      <button key={at.id} onClick={() => handleReativarVinculo(at, comoAntecessora)}
                        className="w-full text-left p-3 border-b border-purple-100 last:border-0 hover:bg-purple-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{at.nome}</p>
                            <p className="text-xs text-slate-500">{pav.nome} · {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</p>
                          </div>
                          <span className="text-xs text-purple-500 flex-shrink-0">inserir após →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button onClick={onCancelar}
          className="w-full mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 flex-shrink-0">
          Cancelar
        </button>
      </div>
    </div>
  );
}
