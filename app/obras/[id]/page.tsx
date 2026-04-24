'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Obra {
  id: number;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
}

interface Pavimento {
  id: number;
  obra_id: number;
  nome: string;
  numero: number | null;
  created_at: string;
}

export default function ObraDetalhes() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<Pavimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    numero: '',
  });

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
    fetchObraEPavimentos();
  }, [obraId, supabase]);

  const fetchObraEPavimentos = async () => {
    try {
      setLoading(true);

      // Buscar obra
      const { data: obraData, error: obraError } = await supabase
        .from('obras')
        .select('*')
        .eq('id', obraId)
        .single();

      if (obraError || !obraData) {
        console.error('Erro ao buscar obra:', obraError);
        return;
      }

      setObra(obraData);

      // Buscar pavimentos
      const { data: pavimentosData, error: pavimentosError } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('obra_id', obraId)
        .order('numero', { ascending: true });

      if (pavimentosError) {
        console.error('Erro ao buscar pavimentos:', pavimentosError);
        return;
      }

      setPavimentos(pavimentosData || []);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const { error } = await supabase.from('pavimentos').insert([
        {
          obra_id: obraId,
          nome: formData.nome,
          numero: formData.numero ? Number(formData.numero) : null,
        },
      ]);

      if (error) {
        console.error('Erro ao criar pavimento:', error);
        alert('❌ Erro ao criar pavimento: ' + error.message);
        setSubmitting(false);
        return;
      }

      // Limpar formulário
      setFormData({
        nome: '',
        numero: '',
      });

      // Recarregar lista
      await fetchObraEPavimentos();
      alert('✅ Pavimento criado com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      alert('❌ Erro ao criar pavimento');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
          <p className="text-slate-500">Carregando obra...</p>
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg mb-4">❌ Obra não encontrada</p>
          <button
            onClick={() => router.push('/')}
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/')}
          className="text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          ← Voltar
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{obra.nome}</h1>
          {obra.descricao && (
            <p className="text-sm text-slate-500 mt-1">{obra.descricao}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
      >
        📊 Ver Linha de Balanço
      </button>
    </div>
  </div>
</header>


      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Informações da Obra */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">📋 Informações da Obra</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-1">Nome</p>
              <p className="text-base font-semibold text-slate-900">{obra.nome}</p>
            </div>

            {obra.descricao && (
              <div>
                <p className="text-sm text-slate-600 mb-1">Descrição</p>
                <p className="text-base text-slate-900">{obra.descricao}</p>
              </div>
            )}

            {obra.data_inicio && (
              <div>
                <p className="text-sm text-slate-600 mb-1">Data de Início</p>
                <p className="text-base font-semibold text-slate-900">
                  {new Date(obra.data_inicio).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}

            {obra.data_fim && (
              <div>
                <p className="text-sm text-slate-600 mb-1">Data de Término</p>
                <p className="text-base font-semibold text-slate-900">
                  {new Date(obra.data_fim).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Seção de Pavimentos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">🏢 Novo Pavimento</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nome do Pavimento */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Pavimento *
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleInputChange}
                    placeholder="Ex: Subsolo, Térreo, 1º Andar"
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Número do Pavimento */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Número (opcional)
                  </label>
                  <input
                    type="number"
                    name="numero"
                    value={formData.numero}
                    onChange={handleInputChange}
                    placeholder="Ex: -1 (subsolo), 0 (térreo), 1, 2..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
                  />
                </div>

                {/* Botão Submit */}
                <button
                  type="submit"
                  disabled={submitting || !formData.nome}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {submitting ? '⏳ Criando...' : '✨ Criar Pavimento'}
                </button>
              </form>
            </div>
          </div>

          {/* Lista de Pavimentos */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">
                📊 Pavimentos ({pavimentos.length})
              </h2>

              {pavimentos.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-lg mb-2">🏗️ Nenhum pavimento criado ainda</p>
                  <p className="text-slate-400 text-sm">Crie seu primeiro pavimento usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pavimentos.map((pavimento) => (
                    <div
                      key={pavimento.id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 text-base">{pavimento.nome}</h3>
                          {pavimento.numero !== null && (
                            <p className="text-slate-600 text-sm mt-1">
                              📍 Número: <strong>{pavimento.numero}</strong>
                            </p>
                          )}
                          <p className="text-slate-500 text-xs mt-2">
                            Criado em {new Date(pavimento.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <button
                          onClick={() => router.push(`/obras/${obraId}/pavimentos/${pavimento.id}`)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                          Ver Atividades
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
            <li>✅ Você abriu uma obra (você fez!)</li>
            <li>✅ Pode criar pavimentos (você fez!)</li>
            <li>⏳ Clicar em pavimento para adicionar atividades</li>
            <li>⏳ Visualizar a Linha de Balanço com todas as atividades</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
