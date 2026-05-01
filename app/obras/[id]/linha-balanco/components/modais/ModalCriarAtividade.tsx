import { parseDate, toStr } from '@/app/calendario';
import type { PavComAtiv } from '@/app/lib/types';
import { getCorSub, calcDuracaoTotal } from '../../utils/geradorCores';
import { fmtDate, gerarUUID } from '../../utils/helpers';

type SubForm = { id: string; nome: string; duracao: string; equipe: string; efetivo: string };
type FormCriar = { nome: string; duracao: string; equipe: string; efetivo: string };

interface Props {
  modalCriar: { pav: PavComAtiv; dataInicio: string; linha: number };
  formCriar: FormCriar;
  setFormCriar: React.Dispatch<React.SetStateAction<FormCriar>>;
  subsCriar: SubForm[];
  setSubsCriar: React.Dispatch<React.SetStateAction<SubForm[]>>;
  usarSubs: boolean;
  setUsarSubs: (v: boolean) => void;
  replicar: boolean;
  setReplicar: (v: boolean) => void;
  vincular: boolean;
  setVincular: (v: boolean) => void;
  pavSelecionados: number[];
  setPavSelecionados: React.Dispatch<React.SetStateAction<number[]>>;
  criando: boolean;
  pavimentosDoBloco: PavComAtiv[];
  calcDataFimUtil: (inicio: Date, duracaoDias: number) => Date;
  calcInicioUtil: (data: Date) => Date;
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
  onCriar: () => void;
  onCancelar: () => void;
}

export function ModalCriarAtividade({
  modalCriar, formCriar, setFormCriar, subsCriar, setSubsCriar,
  usarSubs, setUsarSubs, replicar, setReplicar, vincular, setVincular,
  pavSelecionados, setPavSelecionados, criando, pavimentosDoBloco,
  calcDataFimUtil, calcInicioUtil, feriadosSet, sabadoUtil, domingoUtil,
  onCriar, onCancelar,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-slate-900 mb-1">✨ Nova Atividade</h3>
        <p className="text-xs text-slate-500 mb-5">{modalCriar.pav.nome} — Linha {modalCriar.linha + 1} — a partir de {fmtDate(modalCriar.dataInicio)}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome *</label>
            <input type="text" value={formCriar.nome} onChange={e => setFormCriar(p => ({ ...p, nome: e.target.value }))}
              placeholder="Ex: Alvenaria, Estrutura, Reboco"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={usarSubs} onChange={e => setUsarSubs(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-sm font-semibold text-slate-700">📋 Dividir em subatividades</span>
          </label>

          {usarSubs ? (
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">Subatividades ({subsCriar.length})</p>
                <button type="button"
                  onClick={() => setSubsCriar(p => [...p, { id: gerarUUID(), nome: '', duracao: '5', equipe: '', efetivo: '' }])}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200">
                  + Adicionar
                </button>
              </div>
              {subsCriar.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">Clique em &quot;+ Adicionar&quot; para criar subatividades</p>
              )}
              {subsCriar.map((s, i) => (
                <div key={s.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getCorSub(formCriar.nome || 'x', i) }}></div>
                    <input type="text" value={s.nome} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,nome:e.target.value} : x))}
                      placeholder={`Nome subatividade ${i+1}`}
                      className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                    <button onClick={() => setSubsCriar(p => p.filter((_,j) => j!==i))}
                      className="text-red-400 hover:text-red-600 text-lg w-6 flex-shrink-0">×</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Duração (dias)</label>
                      <input type="number" min="1" value={s.duracao} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,duracao:e.target.value} : x))}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Equipe</label>
                      <input type="text" value={s.equipe} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,equipe:e.target.value} : x))}
                        placeholder="Ex: A"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Efetivo</label>
                      <input type="number" min="1" value={s.efetivo} onChange={e => setSubsCriar(p => p.map((x,j) => j===i ? {...x,efetivo:e.target.value} : x))}
                        placeholder="Qtd"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 text-slate-900" />
                    </div>
                  </div>
                </div>
              ))}
              {subsCriar.length > 0 && (
                <div className="bg-blue-50 rounded p-2 text-xs text-blue-700 font-semibold">
                  ⏱️ {calcDuracaoTotal(subsCriar.map(s => ({ duracao: parseInt(s.duracao)||0 })))} dias úteis
                  &nbsp;·&nbsp; 📅 Até {fmtDate(toStr(calcDataFimUtil(parseDate(modalCriar.dataInicio), calcDuracaoTotal(subsCriar.map(s => ({ duracao: parseInt(s.duracao)||0 }))))))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Duração (dias) *</label>
                <input type="number" min="1" value={formCriar.duracao} onChange={e => setFormCriar(p => ({ ...p, duracao: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
                <input type="text" value={formCriar.equipe} onChange={e => setFormCriar(p => ({ ...p, equipe: e.target.value }))}
                  placeholder="Ex: Equipe A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Efetivo</label>
                <input type="number" min="1" value={formCriar.efetivo} onChange={e => setFormCriar(p => ({ ...p, efetivo: e.target.value }))}
                  placeholder="Qtd func."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
            </div>
          )}

          {!usarSubs && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
              {(() => {
                const ini = calcInicioUtil(parseDate(modalCriar.dataInicio));
                const fim = calcDataFimUtil(ini, parseInt(formCriar.duracao) || 1);
                return <>📅 <strong>{fmtDate(toStr(ini))}</strong> até <strong>{fmtDate(toStr(fim))}</strong>
                  {(!sabadoUtil || !domingoUtil || feriadosSet.size > 0) && (
                    <span className="text-xs text-blue-600 ml-2">(dias úteis)</span>
                  )}</>;
              })()}
            </div>
          )}

          {pavimentosDoBloco.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={replicar} onChange={e => { setReplicar(e.target.checked); if (!e.target.checked) { setVincular(false); setPavSelecionados([]); } }}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-semibold text-slate-700">📋 Replicar em outros pavimentos do bloco</span>
              </label>
              {replicar && (
                <>
                  <div className="ml-6 space-y-1 max-h-36 overflow-y-auto">
                    <label className="flex items-center gap-2 text-xs text-slate-500 mb-2 cursor-pointer">
                      <input type="checkbox" checked={pavSelecionados.length === pavimentosDoBloco.length}
                        onChange={e => setPavSelecionados(e.target.checked ? pavimentosDoBloco.map(p => p.id) : [])}
                        className="w-3.5 h-3.5 rounded accent-blue-600" />
                      Selecionar todos
                    </label>
                    {pavimentosDoBloco.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                        <input type="checkbox" checked={pavSelecionados.includes(p.id)}
                          onChange={e => setPavSelecionados(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                          className="w-4 h-4 rounded accent-blue-600" />
                        {p.nome.includes(' - ') ? p.nome.split(' - ').slice(1).join(' - ') : p.nome}
                      </label>
                    ))}
                  </div>
                  {pavSelecionados.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={vincular} onChange={e => setVincular(e.target.checked)}
                        className="w-4 h-4 rounded accent-purple-600" />
                      <div>
                        <span className="text-sm font-semibold text-slate-700">🔗 Vincular em cascata</span>
                        <p className="text-xs text-slate-500">Cada pavimento começa 1 dia após o fim do anterior</p>
                      </div>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancelar} disabled={criando}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={onCriar} disabled={criando || !formCriar.nome.trim() || (usarSubs && subsCriar.length === 0)}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
            {criando ? '⏳ Criando...' : `✨ Criar${replicar && pavSelecionados.length > 0 ? ` (${1 + pavSelecionados.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
