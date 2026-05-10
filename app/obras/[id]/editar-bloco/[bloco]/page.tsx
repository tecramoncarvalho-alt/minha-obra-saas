'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers';

interface Obra {
  id: number;
  nome: string;
}

interface Pavimento {
  id: number;
  obra_id: number;
  nome: string;
  numero: number | null;
  observacao: string | null;
  created_at: string;
}

// Formato salvo na observação do 1º pavimento:
// __BLOCO__tipo=Torre||obs=Bloco com piscina
const PREFIXO = '__BLOCO__';

const parseMeta = (observacao: string | null) => {
  if (!observacao || !observacao.startsWith(PREFIXO)) {
    return { tipo: '', observacao: observacao || '' };
  }
  const raw = observacao.replace(PREFIXO, '');
  const partes = raw.split('||');
  const tipo = partes.find(p => p.startsWith('tipo='))?.replace('tipo=', '') || '';
  const obs = partes.find(p => p.startsWith('obs='))?.replace('obs=', '') || '';
  return { tipo, observacao: obs };
};

const buildMeta = (tipo: string, obs: string) => {
  return `${PREFIXO}tipo=${tipo}||obs=${obs}`;
};

export default function EditarBloco() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);
  const blocoNomeUrl = decodeURIComponent(params.bloco as string);
  const { role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'planejador') {
      router.replace(`/obras/${obraId}`);
    }
  }, [authLoading, role, obraId, router]);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<Pavimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  // Campos editáveis do bloco
  const [nomeBlocoAtual, setNomeBlocoAtual] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [observacao, setObservacao] = useState('');

  // Adicionar mais pavimentos
  const [formPavimento, setFormPavimento] = useState({ nome: '', numero: '' });
  const [criandoPavimento, setCriandoPavimento] = useState(false);

  // Editar pavimento individual
  const [pavimentoEditando, setPavimentoEditando] = useState<Pavimento | null>(null);
  const [formEdicao, setFormEdicao] = useState({ nome: '', numero: '', observacao: '' });
  const [salvandoPavimento, setSalvandoPavimento] = useState(false);

  // Exclusão de pavimento
  const [pavimentoParaExcluir, setPavimentoParaExcluir] = useState<Pavimento | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchDados(blocoNomeUrl);
  }, [obraId]);

  const fetchDados = async (nomeDoBloco: string) => {
    try {
      setLoading(true);

      const { data: obraData } = await supabase
        .from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('obra_id', obraId)
        .order('numero', { ascending: false });

      if (pavData) {
        const pavDoBloco = pavData.filter((p: Pavimento) =>
          p.nome === nomeDoBloco || p.nome.startsWith(`${nomeDoBloco} - `)
        );

        setPavimentos(pavDoBloco);

        // Ler tipo e observação do 1º pavimento (onde fica o meta)
        if (pavDoBloco.length > 0) {
          const meta = parseMeta(pavDoBloco[0].observacao);
          setTipo(meta.tipo);
          setObservacao(meta.observacao);
        }

        setNomeBlocoAtual(nomeDoBloco);
        setNovoNome(nomeDoBloco);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Salvar bloco ───
  const handleSalvarBloco = async () => {
    if (!novoNome.trim()) {
      setMensagem({ tipo: 'error', texto: '❌ Nome do bloco não pode estar vazio' });
      return;
    }

    setSalvando(true);
    setMensagem(null);
    try {
      let atualizacoes = 0;
      const meta = buildMeta(tipo, observacao);

      for (let i = 0; i < pavimentos.length; i++) {
        const pav = pavimentos[i];

        // Renomear se necessário
        let novoNomePavimento = pav.nome;
        if (novoNome.trim() !== nomeBlocoAtual) {
          if (pav.nome === nomeBlocoAtual) {
            novoNomePavimento = novoNome.trim();
          } else {
            const sufixo = pav.nome.substring(nomeBlocoAtual.length); // " - Térreo" etc
            novoNomePavimento = `${novoNome.trim()}${sufixo}`;
          }
        }

        // Só o 1º pavimento guarda o meta do bloco
        const obsParaSalvar = i === 0 ? meta : (pav.observacao?.startsWith(PREFIXO) ? null : pav.observacao);

        const { error } = await supabase
          .from('pavimentos')
          .update({ nome: novoNomePavimento, observacao: obsParaSalvar })
          .eq('id', pav.id);

        if (!error) atualizacoes++;
      }

      // Atualizar nome atual do bloco e recarregar mantendo campos preenchidos
      const nomeAtualizado = novoNome.trim();
      setNomeBlocoAtual(nomeAtualizado);

      await new Promise(r => setTimeout(r, 400));

      // Recarregar pavimentos mas manter tipo e observação que o usuário preencheu
      const { data: pavData } = await supabase
        .from('pavimentos')
        .select('*')
        .eq('obra_id', obraId)
        .order('numero', { ascending: false });

      if (pavData) {
        const pavDoBloco = pavData.filter((p: Pavimento) =>
          p.nome === nomeAtualizado || p.nome.startsWith(`${nomeAtualizado} - `)
        );
        setPavimentos(pavDoBloco);
      }

      setMensagem({ tipo: 'success', texto: `✅ Bloco atualizado com sucesso! (${atualizacoes} pavimentos)` });
      setTimeout(() => setMensagem(null), 4000);
    } catch (error) {
      setMensagem({ tipo: 'error', texto: '❌ Erro: ' + String(error) });
    } finally {
      setSalvando(false);
    }
  };

  // ─── Adicionar pavimento ───
  const handleAdicionarPavimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPavimento.nome.trim()) return;

    setCriandoPavimento(true);
    try {
      const nomeFinal = `${nomeBlocoAtual} - ${formPavimento.nome}`;
      const { error } = await supabase.from('pavimentos').insert({
        obra_id: obraId,
        nome: nomeFinal,
        numero: formPavimento.numero ? Number(formPavimento.numero) : null,
        observacao: null,
      });

      if (error) {
        setMensagem({ tipo: 'error', texto: '❌ Erro: ' + error.message });
      } else {
        setFormPavimento({ nome: '', numero: '' });
        await new Promise(r => setTimeout(r, 400));

        const { data: pavData } = await supabase
          .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });

        if (pavData) {
          setPavimentos(pavData.filter((p: Pavimento) =>
            p.nome === nomeBlocoAtual || p.nome.startsWith(`${nomeBlocoAtual} - `)
          ));
        }

        setMensagem({ tipo: 'success', texto: '✅ Pavimento adicionado!' });
        setTimeout(() => setMensagem(null), 3000);
      }
    } finally {
      setCriandoPavimento(false);
    }
  };

  // ─── Editar pavimento ───
  // ─── Excluir pavimento ───
  const handleExcluirPavimento = async () => {
    if (!pavimentoParaExcluir) return;
    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('pavimentos')
        .delete()
        .eq('id', pavimentoParaExcluir.id);

      if (error) {
        setMensagem({ tipo: 'error', texto: '❌ Erro ao excluir: ' + error.message });
      } else {
        setPavimentoParaExcluir(null);
        await new Promise(r => setTimeout(r, 400));

        const { data: pavData } = await supabase
          .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });

        if (pavData) {
          setPavimentos(pavData.filter((p: Pavimento) =>
            p.nome === nomeBlocoAtual || p.nome.startsWith(`${nomeBlocoAtual} - `)
          ));
        }

        setMensagem({ tipo: 'success', texto: '✅ Pavimento excluído!' });
        setTimeout(() => setMensagem(null), 3000);
      }
    } finally {
      setExcluindo(false);
      setPavimentoParaExcluir(null);
    }
  };

  const abrirEdicaoPavimento = (pav: Pavimento) => {
    const sufixo = pav.nome.includes(' - ')
      ? pav.nome.split(' - ').slice(1).join(' - ')
      : pav.nome;
    const meta = parseMeta(pav.observacao);
    setPavimentoEditando(pav);
    setFormEdicao({ nome: sufixo, numero: pav.numero !== null ? String(pav.numero) : '', observacao: meta.observacao });
  };

  const handleSalvarPavimento = async () => {
    if (!formEdicao.nome.trim() || !pavimentoEditando) return;

    setSalvandoPavimento(true);
    try {
      const novoNomePavimento = `${nomeBlocoAtual} - ${formEdicao.nome}`;
      const { error } = await supabase
        .from('pavimentos')
        .update({
          nome: novoNomePavimento,
          numero: formEdicao.numero ? Number(formEdicao.numero) : null,
          observacao: formEdicao.observacao || null,
        })
        .eq('id', pavimentoEditando.id);

      if (error) {
        setMensagem({ tipo: 'error', texto: '❌ Erro: ' + error.message });
      } else {
        setPavimentoEditando(null);
        await new Promise(r => setTimeout(r, 400));

        const { data: pavData } = await supabase
          .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });

        if (pavData) {
          setPavimentos(pavData.filter((p: Pavimento) =>
            p.nome === nomeBlocoAtual || p.nome.startsWith(`${nomeBlocoAtual} - `)
          ));
        }

        setMensagem({ tipo: 'success', texto: '✅ Pavimento atualizado!' });
        setTimeout(() => setMensagem(null), 3000);
      }
    } finally {
      setSalvandoPavimento(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
          <p className="text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push(`/obras/${obraId}`)} className="text-blue-600 hover:text-blue-700 font-semibold text-lg">
              ← Voltar
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">✏️ Editar Bloco</h1>
              <p className="text-sm text-slate-500 mt-1">{obra?.nome}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {mensagem && (
          <div className={`p-4 rounded-lg border font-medium ${
            mensagem.tipo === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {mensagem.texto}
          </div>
        )}

        {/* Editar Bloco */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">🏢 Informações do Bloco</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Nome do Bloco/Torre <span className="text-red-500">*</span></label>
              <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Ex: Torre A, Bloco B, Anexo" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo</label>
              <input type="text" value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Ex: Torre, Anexo, Garagem, Piscina" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Observação</label>
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Bloco em reforma, Área de lazer com piscina..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 min-h-24" />
            </div>
            <button onClick={handleSalvarBloco} disabled={salvando || !novoNome.trim()}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors">
              {salvando ? '⏳ Salvando...' : '💾 Salvar Alterações'}
            </button>
          </div>
        </div>

        {/* Adicionar + Lista */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">➕ Adicionar Pavimento</h2>
            <form onSubmit={handleAdicionarPavimento} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome *</label>
                <input type="text" value={formPavimento.nome}
                  onChange={(e) => setFormPavimento({ ...formPavimento, nome: e.target.value })}
                  placeholder="Ex: Cobertura, Platibanda, Ático"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Número (opcional)</label>
                <input type="number" value={formPavimento.numero}
                  onChange={(e) => setFormPavimento({ ...formPavimento, numero: e.target.value })}
                  placeholder="Ex: 21, 22"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <button type="submit" disabled={criandoPavimento || !formPavimento.nome.trim()}
                className="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors">
                {criandoPavimento ? '⏳ Adicionando...' : '✨ Adicionar'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">📋 Pavimentos ({pavimentos.length})</h2>
            {pavimentos.length === 0 ? (
              <p className="text-slate-400 text-center py-8">Nenhum pavimento neste bloco</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pavimentos.map((pav) => {
                  const sufixo = pav.nome.includes(' - ') ? pav.nome.split(' - ').slice(1).join(' - ') : pav.nome;
                  const meta = parseMeta(pav.observacao);
                  return (
                    <div key={pav.id} className="p-3 border border-slate-200 rounded-lg hover:bg-blue-50 transition-colors group">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{sufixo}</p>
                          {pav.numero !== null && <p className="text-xs text-slate-500">Nº {pav.numero}</p>}
                          {meta.observacao && <p className="text-xs text-slate-500 italic mt-1">💬 {meta.observacao}</p>}
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => abrirEdicaoPavimento(pav)}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200">
                            ✏️ Editar
                          </button>
                          <button onClick={() => setPavimentoParaExcluir(pav)}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                            🗑️ Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal Editar Pavimento */}
      {pavimentoEditando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4">✏️ Editar Pavimento</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome</label>
                <input type="text" value={formEdicao.nome} onChange={(e) => setFormEdicao({ ...formEdicao, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Número</label>
                <input type="number" value={formEdicao.numero} onChange={(e) => setFormEdicao({ ...formEdicao, numero: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Observação</label>
                <textarea value={formEdicao.observacao} onChange={(e) => setFormEdicao({ ...formEdicao, observacao: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 min-h-20" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPavimentoEditando(null)} disabled={salvandoPavimento}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSalvarPavimento} disabled={salvandoPavimento}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
                {salvandoPavimento ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Pavimento */}
      {pavimentoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-600 mb-2">Deseja excluir o pavimento?</p>
            <p className="text-slate-900 font-semibold p-3 bg-slate-100 rounded-lg mb-4">
              {pavimentoParaExcluir.nome.includes(' - ')
                ? pavimentoParaExcluir.nome.split(' - ').slice(1).join(' - ')
                : pavimentoParaExcluir.nome}
            </p>
            <p className="text-xs text-red-600 mb-6">⚠️ Esta ação é irreversível.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPavimentoParaExcluir(null)}
                disabled={excluindo}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluirPavimento}
                disabled={excluindo}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-semibold"
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
