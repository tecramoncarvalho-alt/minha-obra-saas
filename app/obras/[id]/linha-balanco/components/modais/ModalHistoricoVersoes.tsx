import React from 'react';
import type { Versao } from '@/app/lib/types';

interface ModalSaidaState {
  destino: string | null;
  tipo: 'navegacao' | 'fechar';
}

interface Props {
  versoes: Versao[];
  versaoAtual: Versao | null;
  isDirty: boolean;
  modoLeitura: boolean;
  destinoPendente: React.MutableRefObject<string | null>;
  setModalHistorico: (v: boolean) => void;
  setModalVersao: (v: boolean) => void;
  setModalSaida: (v: ModalSaidaState | null) => void;
  setVersaoAtual: (v: Versao) => void;
  limparDirty: () => void;
  handleExcluirVersao: (v: Versao) => void;
}

export function ModalHistoricoVersoes({
  versoes, versaoAtual, isDirty, modoLeitura, destinoPendente,
  setModalHistorico, setModalVersao, setModalSaida, setVersaoAtual, limparDirty, handleExcluirVersao,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">🕒 Histórico de Versões</h3>
            <p className="text-xs text-slate-500">{versoes.length} versão(ões) salva(s)</p>
          </div>
          <button onClick={() => { setModalHistorico(false); setModalVersao(true); }}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold">
            + Nova Versão
          </button>
        </div>

        {versoes.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="text-3xl mb-2">📭</p>
            <p>Nenhuma versão salva ainda</p>
          </div>
        ) : (
          <div className="overflow-y-auto space-y-2 flex-1">
            {versoes.map(v => {
              const isAtual = versaoAtual?.id === v.id;
              const data = new Date(v.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              });
              return (
                <div key={v.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isAtual ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-purple-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => {
                      if (isDirty && !modoLeitura) {
                        destinoPendente.current = null;
                        setModalSaida({ destino: null, tipo: 'navegacao' });
                        if (!confirm('Há alterações não salvas. Descartar e trocar de versão?')) return;
                      }
                      limparDirty();
                      setVersaoAtual(v);
                      setModalHistorico(false);
                    }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${v.status === 'Definitiva' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        <p className="font-bold text-slate-900">{v.nome}</p>
                        {isAtual && <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-semibold">Ativa</span>}
                      </div>
                      <p className="text-xs text-slate-500 ml-4">{v.status} · {data}</p>
                      {v.descricao && <p className="text-xs text-slate-600 ml-4 mt-1 italic">{v.descricao}</p>}
                      <p className="text-xs text-slate-400 ml-4 mt-1">
                        {v.snapshot?.pavimentos?.length ?? 0} pavimentos · {' '}
                        {v.snapshot?.pavimentos?.reduce((acc: number, p: { atividades?: unknown[] }) => acc + (p.atividades?.length ?? 0), 0) ?? 0} atividades
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {!isAtual && (
                        <span className="text-xs text-purple-600 font-semibold cursor-pointer"
                          onClick={() => { setVersaoAtual(v); setModalHistorico(false); }}>
                          Carregar →
                        </span>
                      )}
                      {(() => {
                        const definitivas = versoes.filter(v2 => v2.status === 'Definitiva');
                        const bloqueado = v.status === 'Definitiva' && definitivas.length <= 1;
                        return (
                          <button
                            onClick={() => handleExcluirVersao(v)}
                            disabled={bloqueado}
                            title={bloqueado ? 'Não é possível excluir a única versão Definitiva' : `Excluir "${v.nome}"`}
                            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
                              bloqueado
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                            }`}
                          >
                            🗑️
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => setModalHistorico(false)}
          className="mt-4 w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
          Fechar
        </button>
      </div>
    </div>
  );
}
