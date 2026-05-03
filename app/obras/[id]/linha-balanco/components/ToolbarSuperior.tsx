interface Props {
  zoomInicio: string;
  zoomFim: string;
  setZoomInicio: (v: string) => void;
  setZoomFim: (v: string) => void;
  pavimentosFiltro: Set<number>;
  totalPavimentos: number;
  onAbrirFiltros: () => void;
  onImprimir: () => void;
  mostrarAvancoReal?: boolean;
  onToggleAvancoReal?: () => void;
}

export function ToolbarSuperior({
  zoomInicio, zoomFim, setZoomInicio, setZoomFim,
  pavimentosFiltro, totalPavimentos, onAbrirFiltros, onImprimir,
  mostrarAvancoReal = false, onToggleAvancoReal,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">🔍 Zoom:</span>
        <input type="date" value={zoomInicio} onChange={e => setZoomInicio(e.target.value)}
          className="px-2 py-1 border border-slate-300 rounded text-sm text-slate-900 outline-none focus:ring-1 focus:ring-blue-500" />
        <span className="text-slate-400 text-sm">→</span>
        <input type="date" value={zoomFim} onChange={e => setZoomFim(e.target.value)}
          className="px-2 py-1 border border-slate-300 rounded text-sm text-slate-900 outline-none focus:ring-1 focus:ring-blue-500" />
        {(zoomInicio || zoomFim) && (
          <button onClick={() => { setZoomInicio(''); setZoomFim(''); }}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-semibold">✕</button>
        )}
      </div>

      {onToggleAvancoReal && (
        <button
          onClick={onToggleAvancoReal}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            mostrarAvancoReal
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          📈 Avanço Real
        </button>
      )}

      <button onClick={onAbrirFiltros}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          pavimentosFiltro.size > 0
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
        }`}>
        🏢 Pavimentos {pavimentosFiltro.size > 0 ? `(${pavimentosFiltro.size}/${totalPavimentos})` : '(todos)'}
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.06)' }}></div>
            <span>Sáb</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}></div>
            <span>Dom</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}></div>
            <span>Feriado</span>
          </div>
        </div>
        <button onClick={onImprimir}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 flex items-center gap-1">
          🖨️ Imprimir / PDF
        </button>
      </div>
    </div>
  );
}
