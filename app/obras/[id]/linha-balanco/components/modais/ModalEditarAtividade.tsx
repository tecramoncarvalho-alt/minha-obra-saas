import { parseDate, toStr } from '@/app/calendario';
import type { Atividade, PavComAtiv, Dependencia } from '@/app/lib/types';
import { getCorSub, calcDuracaoTotal } from '../../utils/geradorCores';
import { fmtDate, gerarUUID } from '../../utils/helpers';

type SubEditarForm = { id: string; dbId?: number; nome: string; duracao: string; equipe: string; efetivo: string };
type FormEditar = { nome: string; dataInicio: string; dataFim: string; equipe: string; efetivo: string; vinculo_lag: number };

interface Props {
  modalEditar: { at: Atividade; pav: PavComAtiv };
  formEditar: FormEditar;
  setFormEditar: React.Dispatch<React.SetStateAction<FormEditar>>;
  subsEditar: SubEditarForm[];
  setSubsEditar: React.Dispatch<React.SetStateAction<SubEditarForm[]>>;
  salvandoEdicao: boolean;
  excluindoAt: boolean;
  calcDataFimUtil: (inicio: Date, duracaoDias: number) => Date;
  handleQuebrarVinculo: () => void;
  setModalVincular: (v: { at: Atividade } | null) => void;
  handleSalvarEdicao: () => void;
  abrirExcluirAtividade: () => void;
  onCancelar: () => void;
  dependencias: Dependencia[];
  pavimentosExibidos: PavComAtiv[];
  handleRemoverDependencia: (depId: string) => Promise<void>;
  setModalAdicionarDep: (v: { at: Atividade } | null) => void;
}

export function ModalEditarAtividade({
  modalEditar, formEditar, setFormEditar, subsEditar, setSubsEditar,
  salvandoEdicao, excluindoAt, calcDataFimUtil,
  handleQuebrarVinculo, setModalVincular, handleSalvarEdicao,
  abrirExcluirAtividade, onCancelar,
  dependencias, pavimentosExibidos, handleRemoverDependencia, setModalAdicionarDep,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-slate-900 mb-4">✏️ Editar Atividade</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome</label>
            <input type="text" value={formEditar.nome} onChange={e => setFormEditar(p => ({ ...p, nome: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
          </div>

          {subsEditar.length === 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label>
                <input type="date" value={formEditar.dataInicio} onChange={e => setFormEditar(p => ({ ...p, dataInicio: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Data Fim</label>
                <input type="date" value={formEditar.dataFim} onChange={e => setFormEditar(p => ({ ...p, dataFim: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
            </div>
          )}

          {subsEditar.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label>
              <input type="date" value={formEditar.dataInicio} onChange={e => setFormEditar(p => ({ ...p, dataInicio: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
            </div>
          )}

          {subsEditar.length === 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
                <input type="text" value={formEditar.equipe} onChange={e => setFormEditar(p => ({ ...p, equipe: e.target.value }))}
                  placeholder="Ex: Equipe A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Efetivo (func.)</label>
                <input type="number" min="1" value={formEditar.efetivo} onChange={e => setFormEditar(p => ({ ...p, efetivo: e.target.value }))}
                  placeholder="Qtd"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">📋 Subatividades ({subsEditar.length})</p>
              <button type="button"
                onClick={() => setSubsEditar(p => [...p, { id: gerarUUID(), nome: '', duracao: '5', equipe: '', efetivo: '' }])}
                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200">
                + Adicionar
              </button>
            </div>

            {subsEditar.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">Sem subatividades. Clique em &quot;+ Adicionar&quot; para criar.</p>
            )}

            {subsEditar.map((s, i) => (
              <div key={s.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getCorSub(formEditar.nome || modalEditar.at.nome, i) }}></div>
                  <input type="text" value={s.nome}
                    onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,nome:e.target.value} : x))}
                    placeholder={`Nome subatividade ${i+1}`}
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                  <button onClick={() => setSubsEditar(p => p.filter((_,j) => j!==i))}
                    className="text-red-400 hover:text-red-600 text-lg w-6 flex-shrink-0">×</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Duração (dias)</label>
                    <input type="number" min="1" value={s.duracao}
                      onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,duracao:e.target.value} : x))}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Equipe</label>
                    <input type="text" value={s.equipe}
                      onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,equipe:e.target.value} : x))}
                      placeholder="Ex: A"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Efetivo</label>
                    <input type="number" min="1" value={s.efetivo}
                      onChange={e => setSubsEditar(p => p.map((x,j) => j===i ? {...x,efetivo:e.target.value} : x))}
                      placeholder="Qtd"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                  </div>
                </div>
              </div>
            ))}

            {subsEditar.length > 0 && (
              <div className="bg-blue-50 rounded p-2 text-xs text-blue-700 font-semibold">
                ⏱️ {calcDuracaoTotal(subsEditar.map(s => ({ duracao: parseInt(s.duracao)||0 })))} dias úteis
                &nbsp;·&nbsp; 📅 Até {fmtDate(toStr(calcDataFimUtil(parseDate(formEditar.dataInicio), calcDuracaoTotal(subsEditar.map(s => ({ duracao: parseInt(s.duracao)||0 }))))))}
              </div>
            )}
          </div>

          {modalEditar.at.vinculo_id ? (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-purple-800">🔗 Atividade vinculada</p>
                  <p className="text-xs text-purple-600">Ordem na cadeia: {(modalEditar.at.vinculo_ordem ?? 0) + 1}ª</p>
                </div>
                <button onClick={handleQuebrarVinculo}
                  className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">
                  ✂️ Quebrar
                </button>
              </div>
              {(modalEditar.at.vinculo_ordem ?? 0) > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-purple-700 font-semibold whitespace-nowrap">⏱️ Intervalo (dias úteis):</label>
                  <input
                    type="number"
                    value={formEditar.vinculo_lag ?? 0}
                    onChange={e => setFormEditar(prev => ({ ...prev, vinculo_lag: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-2 py-1 border border-purple-300 rounded text-sm text-center"
                  />
                  <span className="text-xs text-purple-500">
                    {(formEditar.vinculo_lag ?? 0) < 0 ? 'sobreposição' : 'folga'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">🔗 Sem vínculo</p>
                  <p className="text-xs text-slate-500">Atividade independente</p>
                </div>
                <button onClick={() => setModalVincular({ at: modalEditar.at })}
                  className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold hover:bg-purple-200">
                  + Vincular
                </button>
              </div>
            </div>
          )}
        {/* Dependências externas (entre cadeias diferentes) */}
        {(() => {
          const predsExternas = dependencias.filter(d => d.sucessora_id === modalEditar.at.id);
          const sucsExternas = dependencias.filter(d => d.predecessora_id === modalEditar.at.id);
          const todasAtivs = pavimentosExibidos.flatMap(p => p.atividades);
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-amber-800">🔀 Dependências Externas</p>
                <button onClick={() => setModalAdicionarDep({ at: modalEditar.at })}
                  className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold hover:bg-amber-200">
                  + Adicionar
                </button>
              </div>
              {predsExternas.length === 0 && sucsExternas.length === 0 && (
                <p className="text-xs text-amber-600">Nenhuma dependência externa.</p>
              )}
              {predsExternas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 font-semibold">Começa após:</p>
                  {predsExternas.map(dep => {
                    const pred = todasAtivs.find(a => a.id === dep.predecessora_id);
                    return (
                      <div key={dep.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1">
                        <span className="text-amber-700">
                          ← {pred?.nome ?? `#${dep.predecessora_id}`}
                          {dep.lag_dias !== 0 && <span className="ml-1 text-amber-500">(lag: {dep.lag_dias}d)</span>}
                        </span>
                        <button onClick={() => handleRemoverDependencia(dep.id)}
                          className="text-red-400 hover:text-red-600 ml-2 font-bold">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {sucsExternas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 font-semibold">Precede:</p>
                  {sucsExternas.map(dep => {
                    const suc = todasAtivs.find(a => a.id === dep.sucessora_id);
                    return (
                      <div key={dep.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1">
                        <span className="text-amber-700">
                          → {suc?.nome ?? `#${dep.sucessora_id}`}
                          {dep.lag_dias !== 0 && <span className="ml-1 text-amber-500">(lag: {dep.lag_dias}d)</span>}
                        </span>
                        <button onClick={() => handleRemoverDependencia(dep.id)}
                          className="text-red-400 hover:text-red-600 ml-2 font-bold">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={abrirExcluirAtividade} disabled={excluindoAt || salvandoEdicao}
            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 text-sm">
            {excluindoAt ? '⏳' : '🗑️'}
          </button>
          <button onClick={onCancelar} disabled={salvandoEdicao}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSalvarEdicao} disabled={salvandoEdicao}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
            {salvandoEdicao ? '⏳' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
