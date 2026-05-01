import type { Versao } from '@/app/lib/types';

interface Props {
  obraNome: string | undefined;
  versaoAtual: Versao | null;
  modoLeitura: boolean;
  modoRascunho: boolean;
  isDirty: boolean;
  totalPavimentos: number;
  totalAtividades: number;
  totalDias: number;
  onVoltar: () => void;
  onHistorico: () => void;
  onSalvarVersao: () => void;
  onDashboard: () => void;
}

const STATS = ['Pavimentos', 'Atividades', 'Dias'] as const;
const STAT_COLORS = { Pavimentos: 'blue', Atividades: 'green', Dias: 'orange' } as const;

export function HeaderLinhaBalanco({
  obraNome, versaoAtual, modoLeitura, modoRascunho, isDirty,
  totalPavimentos, totalAtividades, totalDias,
  onVoltar, onHistorico, onSalvarVersao, onDashboard,
}: Props) {
  const statValues = { Pavimentos: totalPavimentos, Atividades: totalAtividades, Dias: totalDias };

  const versaoBg = modoRascunho
    ? 'bg-blue-100 border border-blue-300 hover:bg-blue-200'
    : modoLeitura
      ? 'bg-green-100 border border-green-300 hover:bg-green-200'
      : isDirty
        ? 'bg-yellow-100 border border-yellow-300 hover:bg-yellow-200'
        : 'bg-slate-100 hover:bg-slate-200';

  const versaoDot = modoRascunho ? 'bg-blue-500'
    : versaoAtual?.status === 'Definitiva' ? 'bg-green-500' : 'bg-yellow-500';

  const versaoText = modoRascunho ? 'text-blue-800'
    : modoLeitura ? 'text-green-800' : 'text-slate-700';

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-full px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onVoltar} className="text-blue-600 hover:text-blue-700 font-semibold">← Voltar</button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white">📊</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Linha de Balanço</h1>
              <p className="text-sm text-slate-500">{obraNome}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {versaoAtual && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${versaoBg}`}
              onClick={onHistorico}>
              <span className={`w-2 h-2 rounded-full ${versaoDot}`}></span>
              <span className={`text-xs font-semibold ${versaoText}`}>
                {modoRascunho ? '✏️' : modoLeitura ? '🔒' : isDirty ? '●' : ''} {versaoAtual.nome}
              </span>
              {modoRascunho && <span className="text-xs text-blue-600 font-bold">RASCUNHO</span>}
              {modoLeitura && <span className="text-xs text-green-600 font-bold">LEITURA</span>}
              {isDirty && !modoLeitura && !modoRascunho && <span className="text-xs text-yellow-700 font-bold">NÃO SALVO</span>}
              <span className="text-xs text-slate-400">▼</span>
            </div>
          )}

          <button onClick={onSalvarVersao}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
            💾 Salvar Versão
          </button>

          <button onClick={onDashboard}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors">
            📋 Dashboard
          </button>

          <div className="flex items-center gap-4 ml-2 pl-4 border-l border-slate-200">
            {STATS.map(l => (
              <div key={l} className="text-center">
                <p className={`text-xl font-bold text-${STAT_COLORS[l]}-600`}>{statValues[l]}</p>
                <p className="text-xs text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
