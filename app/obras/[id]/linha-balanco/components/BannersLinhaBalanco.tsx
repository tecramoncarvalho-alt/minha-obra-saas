import type { Versao } from '@/app/lib/types';

interface Props {
  modoLeitura: boolean;
  modoRascunho: boolean;
  podeEditar: boolean;
  versaoAtual: Versao | null;
  mensagem: { tipo: 'success' | 'error'; texto: string } | null;
  onIniciarRascunho: () => void;
  onHistorico: () => void;
  onSalvarVersao: () => void;
  onDescartarRascunho: () => void;
}

export function BannersLinhaBalanco({
  modoLeitura, modoRascunho, podeEditar, versaoAtual, mensagem,
  onIniciarRascunho, onHistorico, onSalvarVersao, onDescartarRascunho,
}: Props) {
  return (
    <>
      {modoLeitura && !podeEditar && (
        <div className="mb-4 p-4 rounded-lg border-2 border-slate-300 bg-slate-50 flex items-center gap-3">
          <span className="text-2xl">👁️</span>
          <div>
            <p className="font-bold text-slate-700">Modo Visualização</p>
            <p className="text-sm text-slate-500">Seu perfil não permite editar a linha de balanço.</p>
          </div>
        </div>
      )}
      {modoLeitura && podeEditar && (
        <div className="mb-4 p-4 rounded-lg border-2 border-green-300 bg-green-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-bold text-green-900">Versão Definitiva — Somente Leitura</p>
              <p className="text-sm text-green-700">Esta versão está protegida. Edite como rascunho ou selecione outra versão.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onIniciarRascunho}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
              ✏️ Editar como Rascunho
            </button>
            <button onClick={onHistorico}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold">
              Trocar Versão
            </button>
          </div>
        </div>
      )}

      {modoRascunho && (
        <div className="mb-4 p-4 rounded-lg border-2 border-blue-300 bg-blue-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✏️</span>
            <div>
              <p className="font-bold text-blue-900">Rascunho — baseado em &quot;{versaoAtual?.nome}&quot;</p>
              <p className="text-sm text-blue-700">Suas edições estão em modo temporário. Salve como nova versão para preservar.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSalvarVersao}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold">
              💾 Salvar como Nova Versão
            </button>
            <button onClick={onDescartarRascunho}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold">
              ✕ Descartar
            </button>
          </div>
        </div>
      )}

      {mensagem && (
        <div className={`mb-4 p-4 rounded-lg border font-medium ${
          mensagem.tipo === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensagem.texto}
        </div>
      )}
    </>
  );
}
