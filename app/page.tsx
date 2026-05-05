'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers';
import Header from '@/components/Header';

interface Obra {
  id: number;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  foto_url: string | null;
  created_at: string;
}

export default function Home() {
  const router = useRouter();
  const { empresa, loading: authLoading } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: '', descricao: '', data_inicio: '', data_fim: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!authLoading && empresa) fetchObras();
  }, [authLoading, empresa]);

  useEffect(() => {
    obras.forEach(obra => router.prefetch(`/obras/${obra.id}`));
  }, [obras, router]);

  const fetchObras = async () => {
    if (!empresa) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .eq('empresa_id', empresa.id)
        .order('created_at', { ascending: false });
      if (error) console.error('[fetchObras] erro:', error.code, error.message)
      setObras(data || []);
    } finally { setLoading(false); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('obras').insert([{
      nome: formData.nome,
      descricao: formData.descricao || null,
      data_inicio: formData.data_inicio || null,
      data_fim: formData.data_fim || null,
      empresa_id: empresa.id,
    }]).select().single();
    if (!error && data) {
      setFormData({ nome: '', descricao: '', data_inicio: '', data_fim: '' });
      await fetchObras();
    }
    setSubmitting(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Formulário */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">🆕 Nova Obra</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input type="text" name="nome" value={formData.nome} onChange={handleInputChange}
                    placeholder="Ex: Edifício Comercial" required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                  <textarea name="descricao" value={formData.descricao} onChange={handleInputChange}
                    placeholder="Ex: Prédio comercial de 10 andares" rows={3}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de Início</label>
                  <input type="date" name="data_inicio" value={formData.data_inicio} onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de Término</label>
                  <input type="date" name="data_fim" value={formData.data_fim} onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900" />
                </div>
                <button type="submit" disabled={submitting || !formData.nome}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                  {submitting ? '⏳ Criando...' : '✨ Criar Obra'}
                </button>
              </form>
            </div>
          </div>

          {/* Lista de Obras */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">📊 Minhas Obras</h2>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                  <p className="text-slate-500">Carregando...</p>
                </div>
              ) : obras.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-lg mb-2">📭 Nenhuma obra criada ainda</p>
                  <p className="text-slate-400 text-sm">Crie sua primeira obra usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {obras.map(obra => (
                    <div
                      key={obra.id}
                      onClick={() => router.push(`/obras/${obra.id}`)}
                      className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer group"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center border border-slate-200 relative">
                        {obra.foto_url ? (
                          <Image src={obra.foto_url} alt={obra.nome} fill sizes="64px" className="object-cover" />
                        ) : (
                          <span className="text-2xl">🏗️</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 text-lg leading-tight truncate">{obra.nome}</h3>
                        {obra.descricao && (
                          <p className="text-slate-500 text-sm mt-0.5 truncate">{obra.descricao}</p>
                        )}
                        <div className="flex gap-3 mt-1.5 text-xs text-slate-400">
                          {obra.data_inicio && <span>📅 {new Date(obra.data_inicio).toLocaleDateString('pt-BR')}</span>}
                          {obra.data_fim && <span>→ {new Date(obra.data_fim).toLocaleDateString('pt-BR')}</span>}
                        </div>
                      </div>
                      <span className="text-blue-400 group-hover:text-blue-600 text-xl flex-shrink-0">›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
