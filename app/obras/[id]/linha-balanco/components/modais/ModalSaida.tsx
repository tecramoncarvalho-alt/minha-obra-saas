interface Props {
  onSalvar: () => void;
  onDescartar: () => void;
  onContinuar: () => void;
}

export function ModalSaida({ onSalvar, onDescartar, onContinuar }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Alterações não salvas</h3>
            <p className="text-sm text-slate-500">Você tem alterações que ainda não foram salvas.</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-6">
          Se sair agora, as alterações feitas na versão em andamento serão perdidas.
        </p>

        <div className="space-y-2">
          <button
            onClick={onSalvar}
            className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            💾 Salvar antes de sair
          </button>
          <button
            onClick={onDescartar}
            className="w-full px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition-colors"
          >
            🗑️ Descartar alterações e sair
          </button>
          <button
            onClick={onContinuar}
            className="w-full px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
          >
            Continuar editando
          </button>
        </div>
      </div>
    </div>
  );
}
