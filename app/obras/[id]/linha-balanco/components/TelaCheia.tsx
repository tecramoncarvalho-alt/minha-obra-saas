import type { PavComAtiv } from '@/app/lib/types';
import { addDias } from '@/app/calendario';
import { GraficoLinhaBalanco } from './GraficoLinhaBalanco';

interface Props {
  obraNome: string | undefined;
  dataMin: Date;
  totalDias: number;
  zoomInicio: string;
  zoomFim: string;
  setZoomInicio: (v: string) => void;
  setZoomFim: (v: string) => void;
  pavimentosFiltro: Set<number>;
  coresCache: Record<string, string>;
  pavimentosFiltrados: PavComAtiv[];
  diasCalendario: Date[];
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
  onAbrirFiltros: () => void;
  onImprimir: () => void;
  onFechar: () => void;
}

export function TelaCheia({
  obraNome, dataMin, totalDias, zoomInicio, zoomFim, setZoomInicio, setZoomFim,
  pavimentosFiltro, coresCache, pavimentosFiltrados, diasCalendario,
  feriadosSet, sabadoUtil, domingoUtil,
  onAbrirFiltros, onImprimir, onFechar,
}: Props) {
  const pxPorDia = totalDias <= 30 ? 44 : totalDias <= 60 ? 30 : totalDias <= 120 ? 20 : 12;

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">📊</span>
          </div>
          <div>
            <p className="font-bold text-slate-900">{obraNome} — Linha de Balanço</p>
            <p className="text-xs text-slate-500">
              {dataMin.toLocaleDateString('pt-BR')} → {addDias(dataMin, totalDias).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={zoomInicio} onChange={e => setZoomInicio(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-900 outline-none" />
          <span className="text-slate-400">→</span>
          <input type="date" value={zoomFim} onChange={e => setZoomFim(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-900 outline-none" />
          {(zoomInicio || zoomFim) && (
            <button onClick={() => { setZoomInicio(''); setZoomFim(''); }}
              className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">✕</button>
          )}
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button onClick={onAbrirFiltros}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              pavimentosFiltro.size > 0
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}>
            🏢 {pavimentosFiltro.size > 0 ? `${pavimentosFiltro.size} pavtos` : 'Todos'}
          </button>
          <button onClick={onImprimir}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300">
            🖨️ Imprimir
          </button>
          <button onClick={onFechar}
            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold border border-red-200">
            ✕ Fechar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0 text-xs text-slate-500 flex-wrap">
        {Object.entries(coresCache).map(([nome, cor]) => (
          <div key={nome} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
            <span>{nome}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
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
      </div>

      <div className="flex-1 overflow-auto" id="grafico-print">
        <GraficoLinhaBalanco
          pavimentosFiltrados={pavimentosFiltrados}
          diasCalendario={diasCalendario}
          dataMin={dataMin}
          totalDias={totalDias}
          pxPorDia={pxPorDia}
          feriadosSet={feriadosSet}
          sabadoUtil={sabadoUtil}
          domingoUtil={domingoUtil}
          stickyHeader
        />
      </div>
    </div>
  );
}
