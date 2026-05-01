interface ConflitorReducao { atNome: string; pavNome: string; linha: number }

interface EditandoBlocoState {
  blocoNome: string;
  linhasAtuais: number;
  linhasOriginais: number;
  conflitosReducao: ConflitorReducao[];
}

interface Props {
  editandoBloco: EditandoBlocoState;
  setEditandoBloco: React.Dispatch<React.SetStateAction<EditandoBlocoState | null>>;
  salvandoLinhas: boolean;
  calcularConflitosReducao: (blocoNome: string, novasLinhas: number) => ConflitorReducao[];
  handleSalvarLinhas: (novasLinhas: number) => void;
}

export function ModalEditarLinhas({
  editandoBloco, setEditandoBloco, salvandoLinhas, calcularConflitosReducao, handleSalvarLinhas,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">📊 Linhas por Pavimento</h3>
        <p className="text-sm text-slate-500 mb-1">Bloco: <strong>{editandoBloco.blocoNome}</strong></p>
        <p className="text-xs text-slate-400 mb-5">Altera todos os pavimentos deste bloco</p>

        <div className="flex gap-3 justify-center mb-4">
          {[1,2,3,4,5].map(n => {
            const c = n < editandoBloco.linhasOriginais ? calcularConflitosReducao(editandoBloco.blocoNome, n) : [];
            const temC = c.length > 0;
            const sel = editandoBloco.linhasAtuais === n;
            return (
              <button key={n}
                onClick={() => setEditandoBloco(prev => prev ? { ...prev, linhasAtuais: n, conflitosReducao: temC ? c : [] } : null)}
                className={`w-14 h-14 rounded-xl font-bold text-lg transition-all relative ${sel ? temC ? 'bg-red-500 text-white shadow-lg scale-110' : 'bg-blue-600 text-white shadow-lg scale-110' : temC ? 'bg-red-50 text-red-600 border-2 border-red-300' : 'bg-slate-100 text-slate-700 hover:bg-blue-100'}`}>
                {n}
                {temC && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">!</span>}
              </button>
            );
          })}
        </div>

        {editandoBloco.conflitosReducao.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-bold text-red-800 mb-2">⚠️ Mova estas atividades antes de reduzir:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {editandoBloco.conflitosReducao.map((c, i) => (
                <p key={i} className="text-xs text-red-700 bg-red-100 rounded px-2 py-1">• <strong>{c.atNome}</strong> — {c.pavNome} (linha {c.linha})</p>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => setEditandoBloco(null)} disabled={salvandoLinhas}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">Cancelar</button>
          <button onClick={() => handleSalvarLinhas(editandoBloco.linhasAtuais)}
            disabled={salvandoLinhas || editandoBloco.conflitosReducao.length > 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold">
            {salvandoLinhas ? '⏳' : editandoBloco.conflitosReducao.length > 0 ? '🚫 Resolva conflitos' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
