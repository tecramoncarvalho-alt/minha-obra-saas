import type { PavComAtiv } from '@/app/lib/types';

interface Props {
  pavimentosExibidos: PavComAtiv[];
  pavimentosFiltro: Set<number>;
  setPavimentosFiltro: React.Dispatch<React.SetStateAction<Set<number>>>;
  onFechar: () => void;
}

export function ModalFiltros({ pavimentosExibidos, pavimentosFiltro, setPavimentosFiltro, onFechar }: Props) {
  const grupos: Record<string, PavComAtiv[]> = {};
  pavimentosExibidos.forEach(p => {
    const b = p.blocoNome || 'Sem Bloco';
    if (!grupos[b]) grupos[b] = [];
    grupos[b].push(p);
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">🏢 Filtrar Pavimentos</h3>
          <div className="flex gap-2">
            <button onClick={() => setPavimentosFiltro(new Set())}
              className="px-2 py-1 text-xs text-blue-600 hover:underline">Todos</button>
            <button onClick={() => setPavimentosFiltro(new Set(pavimentosExibidos.map(p => p.id)))}
              className="px-2 py-1 text-xs text-slate-500 hover:underline">Nenhum</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3">
          {Object.entries(grupos).map(([bloco, pavs]) => (
            <div key={bloco} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                <span className="font-semibold text-slate-700 text-sm">🏢 {bloco}</span>
                <button
                  onClick={() => {
                    const ids = pavs.map(p => p.id);
                    const todosAtivos = ids.every(id => pavimentosFiltro.size === 0 || pavimentosFiltro.has(id));
                    setPavimentosFiltro(prev => {
                      const next = new Set(prev.size === 0 ? pavimentosExibidos.map(p => p.id) : prev);
                      if (todosAtivos) ids.forEach(id => next.delete(id));
                      else ids.forEach(id => next.add(id));
                      return next.size === pavimentosExibidos.length ? new Set() : next;
                    });
                  }}
                  className="text-xs text-blue-600 hover:underline">
                  {pavs.every(p => pavimentosFiltro.size === 0 || pavimentosFiltro.has(p.id)) ? 'Remover bloco' : 'Adicionar bloco'}
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {pavs.map(pav => {
                  const ativo = pavimentosFiltro.size === 0 || pavimentosFiltro.has(pav.id);
                  const nomeSufixo = pav.nome.includes(' - ') ? pav.nome.split(' - ').slice(1).join(' - ') : pav.nome;
                  return (
                    <label key={pav.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={ativo}
                        onChange={() => {
                          setPavimentosFiltro(prev => {
                            const base = prev.size === 0
                              ? new Set(pavimentosExibidos.map(p => p.id))
                              : new Set(prev);
                            if (base.has(pav.id)) base.delete(pav.id);
                            else base.add(pav.id);
                            return base.size === pavimentosExibidos.length ? new Set() : base;
                          });
                        }}
                        className="w-4 h-4 rounded accent-blue-600" />
                      <span className="text-sm text-slate-700">{nomeSufixo}</span>
                      {pav.numero !== null && <span className="text-xs text-slate-400 ml-auto">Nº {pav.numero}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={() => { setPavimentosFiltro(new Set()); onFechar(); }}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
            Limpar Filtros
          </button>
          <button onClick={onFechar}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
            Aplicar ({pavimentosFiltro.size === 0 ? 'todos' : pavimentosFiltro.size})
          </button>
        </div>
      </div>
    </div>
  );
}
