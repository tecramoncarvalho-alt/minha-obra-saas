'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Pavimento {
  id: number;
  obra_id: number;
  nome: string;
  numero: number | null;
  created_at: string;
}

interface Atividade {
  id: number;
  pavimento_id: number;
  nome: string;
  data_inicio: string;
  data_fim: string;
  duracao_dias: number | null;
  equipe: string | null;
  created_at: string;
}

export default function PavimentoDetalhes() {
  const params = useParams();
  const router = useRouter();
  const pavimentoId = Number(params.pavimentoId);

  const [pavimento, setPavimento] = useState<Pavimento | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    data_inicio: '',
    data_fim: '',
    equipe: '',
  });

  // Exclusão de atividade
  const [atividadeParaExcluir, setAtividadeParaExcluir] = useState<Atividade | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Criar cliente Supabase uma única vez
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Credenciais do Supabase não configuradas');
    }

    return createClient(url, key);
  }, []);

  // Carregar dados ao iniciar
  useEffect(() => {
    fetchPavimentoEAtividades();
  }, [pavimentoId, supabase]);

  const fetchPavimentoEAtividades = async () => {
    try {
      setLoading(true);

      // Buscar pavimento
      const { data: pavimentoData, error: pavimentoError } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('id', pavimentoId)
        .single();

      if (pavimentoError || !pavimentoData) {
        console.error('Erro ao buscar pavimento:', pavimentoError);
        return;
      }

      setPavimento(pavimentoData);

      // Buscar atividades
      const { data: atividadesData, error: atividadesError } = await supabase
        .from('atividades')
        .select('*')
        .eq('pavimento_id', pavimentoId)
        .order('data_inicio', { ascending: true });

      if (atividadesError) {
        console.error('Erro ao buscar atividades:', atividadesError);
        return;
      }

      setAtividades(atividadesData || []);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Calcular duração em dias
  const calcularDuracao = (dataInicio: string, dataFim: string) => {
    if (!dataInicio || !dataFim) return null;
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const duracao = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return duracao > 0 ? duracao : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const duracao = calcularDuracao(formData.data_inicio, formData.data_fim);

      const { error } = await supabase.from('atividades').insert([
        {
          pavimento_id: pavimentoId,
          nome: formData.nome,
          data_inicio: formData.data_inicio,
          data_fim: formData.data_fim,
          duracao_dias: duracao,
          equipe: formData.equipe || null,
        },
      ]);

      if (error) {
        console.error('Erro ao criar atividade:', error);
        alert('❌ Erro ao criar atividade: ' + error.message);
        setSubmitting(false);
        return;
      }

      // Limpar formulário
      setFormData({
        nome: '',
        data_inicio: '',
        data_fim: '',
        equipe: '',
      });

      // Recarregar lista
      await fetchPavimentoEAtividades();
      alert('✅ Atividade criada com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      alert('❌ Erro ao criar atividade');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Exclusão de Atividade ───
  const handleExcluirAtividade = async () => {
    if (!atividadeParaExcluir) return;

    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('atividades')
        .delete()
        .eq('id', atividadeParaExcluir.id);

      if (error) {
        alert('❌ Erro ao deletar atividade: ' + error.message);
      } else {
        setAtividadeParaExcluir(null);
        setExcluindo(false);

        // Aguardar um pouco e recarregar dados
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchPavimentoEAtividades();

        alert('✅ Atividade excluída com sucesso!');
      }
    } catch (error) {
      alert('❌ Erro durante exclusão: ' + String(error));
    } finally {
      setExcluindo(false);
      setAtividadeParaExcluir(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
          <p className="text-slate-500">Carregando pavimento...</p>
        </div>
      </div>
    );
  }

  if (!pavimento) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg mb-4">❌ Pavimento não encontrado</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-700 font-semibold text-lg"
            >
              ← Voltar
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{pavimento.nome}</h1>
              {pavimento.numero !== null && (
                <p className="text-sm text-slate-500 mt-1">📍 Número: {pavimento.numero}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Informações do Pavimento */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">📋 Informações do Pavimento</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-1">Nome</p>
              <p className="text-base font-semibold text-slate-900">{pavimento.nome}</p>
            </div>

            {pavimento.numero !== null && (
              <div>
                <p className="text-sm text-slate-600 mb-1">Número</p>
                <p className="text-base font-semibold text-slate-900">{pavimento.numero}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-600 mb-1">Criado em</p>
              <p className="text-base text-slate-900">
                {new Date(pavimento.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Seção de Atividades */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">⚙️ Nova Atividade</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nome da Atividade */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome da Atividade *
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleInputChange}
                    placeholder="Ex: Estrutura, Reboco, Acabamento"
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Data Início */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    name="data_inicio"
                    value={formData.data_inicio}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Data Fim */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Data de Término *
                  </label>
                  <input
                    type="date"
                    name="data_fim"
                    value={formData.data_fim}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Equipe */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Equipe (opcional)
                  </label>
                  <input
                    type="text"
                    name="equipe"
                    value={formData.equipe}
                    onChange={handleInputChange}
                    placeholder="Ex: Equipe A, Carpinteiros, Pedreiros"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Botão Submit */}
                <button
                  type="submit"
                  disabled={submitting || !formData.nome || !formData.data_inicio || !formData.data_fim}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {submitting ? '⏳ Criando...' : '✨ Criar Atividade'}
                </button>
              </form>
            </div>
          </div>

          {/* Lista de Atividades */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">
                📊 Atividades ({atividades.length})
              </h2>

              {atividades.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-lg mb-2">⚙️ Nenhuma atividade criada ainda</p>
                  <p className="text-slate-400 text-sm">Crie sua primeira atividade usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {atividades.map((atividade) => (
                    <div
                      key={atividade.id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 text-base">{atividade.nome}</h3>

                          <div className="flex gap-4 mt-2 text-xs text-slate-500">
                            <span>📅 Início: {new Date(atividade.data_inicio).toLocaleDateString('pt-BR')}</span>
                            <span>📅 Fim: {new Date(atividade.data_fim).toLocaleDateString('pt-BR')}</span>
                          </div>

                          <div className="flex gap-4 mt-2 text-xs text-slate-600">
                            {atividade.duracao_dias && (
                              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
                                ⏱️ {atividade.duracao_dias} dias
                              </span>
                            )}
                            {atividade.equipe && (
                              <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-semibold">
                                👥 {atividade.equipe}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botão Excluir */}
                        <button
                          onClick={() => setAtividadeParaExcluir(atividade)}
                          className="ml-4 px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          🗑️ Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Footer */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">💡 Próximos Passos</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✅ Você criou obras e pavimentos!</li>
            <li>✅ Agora criou atividades (você fez!)</li>
            <li>✅ Pode excluir atividades individuais</li>
            <li>⏳ Visualizar a Linha de Balanço com todas as atividades</li>
            <li>⏳ Permitir reprogramações dinâmicas</li>
          </ul>
        </div>
      </main>

      {/* Modal de Confirmação de Exclusão */}
      {atividadeParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-600 mb-2">Você tem certeza que deseja excluir?</p>
            <p className="text-slate-900 font-semibold mb-6 p-3 bg-slate-100 rounded-lg">
              {atividadeParaExcluir.nome}
            </p>
            <p className="text-sm text-slate-500 mb-6">
              ⚠️ Esta ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setAtividadeParaExcluir(null)}
                disabled={excluindo}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluirAtividade}
                disabled={excluindo}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-colors"
              >
                {excluindo ? '⏳ Excluindo...' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
