import type { Atividade, PavComAtiv } from '@/app/lib/types';
import { fmtDate } from '../../utils/helpers';

interface ModalExcluirAtState {
  at: Atividade;
  cadeia: { at: Atividade; pav: PavComAtiv; mesmoLote: boolean }[];
  vinculoId: string | null;
}

interface Props {
  modalExcluirAt: ModalExcluirAtState;
  excluindoAtModal: boolean;
  pavimentosExibidos: PavComAtiv[];
  excluirAtividadesIds: (ids: number[], desvinculaIds?: number[]) => void;
  onCancelar: () => void;
}

export function ModalExcluirComVinculo({
  modalExcluirAt, excluindoAtModal, pavimentosExibidos, excluirAtividadesIds, onCancelar,
}: Props) {
  const pavNomeAt = pavimentosExibidos.find(p => p.atividades.find(a => a.id === modalExcluirAt.at.id))?.nome;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4">

        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🗑️</span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Excluir Atividade Vinculada</h3>
            <p className="text-sm text-slate-500">Esta atividade faz parte de uma cadeia</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-xs font-semibold text-red-600 mb-1">Atividade selecionada para exclusão:</p>
          <p className="font-bold text-slate-900">{modalExcluirAt.at.nome}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {pavNomeAt} &nbsp;·&nbsp;
            {fmtDate(modalExcluirAt.at.data_inicio)} → {fmtDate(modalExcluirAt.at.data_fim)}
          </p>
        </div>

        {modalExcluirAt.cadeia.length > 0 && (
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              🔗 Atividades vinculadas ({modalExcluirAt.cadeia.length}):
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {modalExcluirAt.cadeia.map(({ at, pav, mesmoLote }) => (
                <div key={at.id} className={`flex items-center justify-between p-2.5 rounded-lg border text-sm ${
                  mesmoLote ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                }`}>
                  <div>
                    <p className="font-semibold text-slate-900">{at.nome}</p>
                    <p className="text-xs text-slate-500">{pav.nome} · {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    mesmoLote ? 'bg-orange-200 text-orange-800' : 'bg-blue-200 text-blue-800'
                  }`}>
                    {mesmoLote ? 'Mesmo lote' : 'Vinc. manual'}
                  </span>
                </div>
              ))}
            </div>
            {modalExcluirAt.cadeia.some(c => !c.mesmoLote) && (
              <p className="text-xs text-blue-700 mt-2 bg-blue-50 rounded p-2">
                ℹ️ Atividades marcadas como <strong>&quot;Vinc. manual&quot;</strong> foram vinculadas posteriormente e podem pertencer a outro lote.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={() => excluirAtividadesIds([modalExcluirAt.at.id], [])}
            disabled={excluindoAtModal}
            className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-200 text-white rounded-lg font-semibold text-sm text-left flex items-center gap-3 transition-colors"
          >
            <span className="text-xl">🗑️</span>
            <div>
              <div>Excluir apenas esta atividade</div>
              <div className="text-xs font-normal opacity-80">As demais permanecem vinculadas entre si</div>
            </div>
          </button>

          <button
            onClick={() => {
              const desvincula = modalExcluirAt.cadeia.map(c => c.at.id);
              excluirAtividadesIds([modalExcluirAt.at.id], desvincula);
            }}
            disabled={excluindoAtModal}
            className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-200 text-white rounded-lg font-semibold text-sm text-left flex items-center gap-3 transition-colors"
          >
            <span className="text-xl">✂️</span>
            <div>
              <div>Excluir esta e quebrar vínculos das demais</div>
              <div className="text-xs font-normal opacity-80">As demais ficam independentes (sem vínculo)</div>
            </div>
          </button>

          {modalExcluirAt.cadeia.some(c => c.mesmoLote) && (
            <button
              onClick={() => {
                const mesmoLoteIds = modalExcluirAt.cadeia.filter(c => c.mesmoLote).map(c => c.at.id);
                const desvincula = modalExcluirAt.cadeia.filter(c => !c.mesmoLote).map(c => c.at.id);
                excluirAtividadesIds([modalExcluirAt.at.id, ...mesmoLoteIds], desvincula);
              }}
              disabled={excluindoAtModal}
              className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 text-white rounded-lg font-semibold text-sm text-left flex items-center gap-3 transition-colors"
            >
              <span className="text-xl">🗑️🗑️</span>
              <div>
                <div>Excluir esta + atividades do mesmo lote</div>
                <div className="text-xs font-normal opacity-80">
                  {modalExcluirAt.cadeia.filter(c => c.mesmoLote).length + 1} atividades · vínculos manuais são preservados
                </div>
              </div>
            </button>
          )}

          <button
            onClick={() => {
              const todos = [modalExcluirAt.at.id, ...modalExcluirAt.cadeia.map(c => c.at.id)];
              excluirAtividadesIds(todos);
            }}
            disabled={excluindoAtModal}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 text-white rounded-lg font-semibold text-sm text-left flex items-center gap-3 transition-colors"
          >
            <span className="text-xl">💥</span>
            <div>
              <div>Excluir toda a cadeia vinculada</div>
              <div className="text-xs font-normal opacity-80">
                {modalExcluirAt.cadeia.length + 1} atividades serão excluídas
              </div>
            </div>
          </button>

          <button
            onClick={onCancelar}
            disabled={excluindoAtModal}
            className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
