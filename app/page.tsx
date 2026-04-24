'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Obra {
  id: number;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
}

export default function Home() {
  const router = useRouter();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    data_inicio: '',
    data_fim: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Criar cliente Supabase uma única vez
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Credenciais do Supabase não configuradas');
    }

    return createClient(url, key);
  }, []);

  // Carregar obras ao iniciar
  useEffect(() => {
    fetchObras();
  }, [supabase]);

  const fetchObras = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar obras:', error);
        return;
      }

      setObras(data || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase.from('obras').insert([
        {
          nome: formData.nome,
          descricao: formData.descricao || null,
          data_inicio: formData.data_inicio || null,
          data_fim: formData.data_fim || null,
        },
      ]);

      if (error) {
        console.error('Erro ao criar obra:', error);
        alert('❌ Erro ao criar obra: ' + error.message);
        setSubmitting(false);
        return;
      }

      // Limpar formulário
      setFormData({
        nome: '',
        descricao: '',
        data_inicio: '',
        data_fim: '',
      });

      // Recarregar lista
      await fetchObras();
      alert('✅ Obra criada com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      alert('❌ Erro ao criar obra');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">🏗️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Linha de Balanço</h1>
              <p className="text-sm text-slate-500">Planejamento e Controle de Obras</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">📋 Nova Obra</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nome da Obra */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome da Obra *
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleInputChange}
                    placeholder="Ex: Edifício Comercial"
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Descrição
                  </label>
                  <textarea
                    name="descricao"
                    value={formData.descricao}
                    onChange={handleInputChange}
                    placeholder="Ex: Prédio comercial de 10 andares"
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Data Início */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    name="data_inicio"
                    value={formData.data_inicio}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Data Fim */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Data de Término
                  </label>
                  <input
                    type="date"
                    name="data_fim"
                    value={formData.data_fim}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Botão Submit */}
                <button
                  type="submit"
                  disabled={submitting || !formData.nome}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {submitting ? '⏳ Criando...' : '✨ Criar Obra'}
                </button>
              </form>
            </div>
          </div>

          {/* Lista de Obras */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">📊 Minhas Obras ({obras.length})</h2>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                    <p className="text-slate-500">Carregando obras...</p>
                  </div>
                </div>
              ) : obras.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-lg mb-2">📭 Nenhuma obra criada ainda</p>
                  <p className="text-slate-400 text-sm">Crie sua primeira obra usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {obras.map((obra) => (
                    <div
                      key={obra.id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 text-base">{obra.nome}</h3>
                          {obra.descricao && (
                            <p className="text-slate-600 text-sm mt-1">{obra.descricao}</p>
                          )}
                          <div className="flex gap-4 mt-3 text-xs text-slate-500">
                            {obra.data_inicio && (
                              <span>📅 Início: {new Date(obra.data_inicio).toLocaleDateString('pt-BR')}</span>
                            )}
                            {obra.data_fim && (
                              <span>📅 Fim: {new Date(obra.data_fim).toLocaleDateString('pt-BR')}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => router.push(`/obras/${obra.id}`)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                          Abrir
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
            <li>✅ Criar uma obra (você fez!)</li>
            <li>✅ Adicionar pavimentos à obra (você faz agora!)</li>
            <li>⏳ Adicionar atividades aos pavimentos</li>
            <li>⏳ Visualizar a Linha de Balanço (gráfico)</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
