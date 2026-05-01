import type { PavComAtiv, Versao } from '@/app/lib/types';

type FormVersao = {
  nome: string;
  descricao: string;
  status: 'Definitiva' | 'Em Atualização';
  sobrescreverVersaoId: number | null;
  erroNome: string;
};

interface Props {
  formVersao: FormVersao;
  setFormVersao: React.Dispatch<React.SetStateAction<FormVersao>>;
  versoes: Versao[];
  modoRascunho: boolean;
  versaoAtual: Versao | null;
  salvandoVersao: boolean;
  pavimentos: PavComAtiv[];
  totalAtividades: number;
  handleSalvarVersao: () => void;
  onCancelar: () => void;
}

export function ModalSalvarVersao({
  formVersao, setFormVersao, versoes, modoRascunho, versaoAtual,
  salvandoVersao, pavimentos, totalAtividades, handleSalvarVersao, onCancelar,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">💾 Salvar Versão</h3>
        <p className="text-xs text-slate-500 mb-1">Snapshot do estado atual da Linha de Balanço</p>
        {modoRascunho && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            📋 Baseado em: <strong>&quot;{versaoAtual?.nome}&quot;</strong> — a Definitiva original não será alterada
          </div>
        )}

        <div className="space-y-4">
          {versoes.filter(v => v.status === 'Em Atualização').length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Salvar em cima de versão existente?
              </label>
              <select
                value={formVersao.sobrescreverVersaoId ?? ''}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const v = id ? versoes.find(v => v.id === id) : null;
                  setFormVersao(p => ({
                    ...p,
                    sobrescreverVersaoId: id,
                    nome: v ? v.nome : p.nome,
                    erroNome: '',
                  }));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">— Criar nova versão —</option>
                {versoes.filter(v => v.status === 'Em Atualização').map(v => (
                  <option key={v.id} value={v.id}>🔄 {v.nome}</option>
                ))}
              </select>
              {formVersao.sobrescreverVersaoId && (
                <p className="text-xs text-yellow-600 mt-1">⚠️ O snapshot desta versão será substituído</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome da Versão *</label>
            <input type="text" value={formVersao.nome}
              onChange={e => setFormVersao(p => ({ ...p, nome: e.target.value, erroNome: '' }))}
              placeholder="Ex: Baseline, Rev. 1, Aprovada Cliente"
              disabled={!!formVersao.sobrescreverVersaoId}
              className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 ${
                formVersao.erroNome ? 'border-red-400 bg-red-50' : 'border-slate-300'
              } ${formVersao.sobrescreverVersaoId ? 'bg-slate-100 text-slate-500' : ''}`} />
            {formVersao.erroNome && (
              <p className="text-xs text-red-600 mt-1">❌ {formVersao.erroNome}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
            <textarea value={formVersao.descricao}
              onChange={e => setFormVersao(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Ex: Versão aprovada em reunião de 28/04"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 min-h-16" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
            <div className="flex gap-3">
              {(['Definitiva', 'Em Atualização'] as const).map(s => {
                const bloqueado = !!formVersao.sobrescreverVersaoId && s === 'Definitiva';
                return (
                  <button key={s} type="button"
                    disabled={bloqueado}
                    onClick={() => !bloqueado && setFormVersao(p => ({ ...p, status: s }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                      formVersao.status === s
                        ? s === 'Definitiva'
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-yellow-500 border-yellow-500 text-white'
                        : bloqueado
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>
                    {s === 'Definitiva' ? '✅ Definitiva' : '🔄 Em Atualização'}
                  </button>
                );
              })}
            </div>
            {formVersao.status === 'Definitiva' && !formVersao.sobrescreverVersaoId && (
              <p className="text-xs text-green-600 mt-1">Esta versão será carregada por padrão no Dashboard</p>
            )}
            {formVersao.sobrescreverVersaoId && (
              <p className="text-xs text-slate-400 mt-1">Versões em atualização não podem ser promovidas a Definitiva aqui</p>
            )}
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
            📊 Snapshot: <strong>{pavimentos.length} pavimentos</strong>, <strong>{totalAtividades} atividades</strong>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancelar} disabled={salvandoVersao}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSalvarVersao} disabled={salvandoVersao || !formVersao.nome.trim()}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
            {salvandoVersao ? '⏳ Salvando...' : formVersao.sobrescreverVersaoId ? '🔄 Atualizar' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
