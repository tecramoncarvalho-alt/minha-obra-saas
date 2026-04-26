'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────── Tipos ───────────────────────────
interface Obra {
  id: number;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  foto_url: string | null;
  created_at: string;
}

interface Pavimento {
  id: number;
  obra_id: number;
  nome: string;
  numero: number | null;
  observacao: string | null;
  created_at: string;
}

interface PavimentoEspecial {
  id: string;
  nome: string;
  numero: string;
}

interface PavimentoRepetido {
  id: string;
  prefixo: string;
  de: number;
  ate: number;
}

interface Bloco {
  id: string;
  nome: string;
  tipo: string;
  linhas: number;
  especiais: PavimentoEspecial[];
  repetidos: PavimentoRepetido[];
}

// ─────────────────────────── Helpers ───────────────────────────
let uid = 0;
const newId = () => `${Date.now()}-${++uid}`;

const criarEspecial = (nome = '', numero = ''): PavimentoEspecial => ({
  id: newId(), nome, numero,
});

const criarRepetido = (): PavimentoRepetido => ({
  id: newId(), prefixo: 'Andar', de: 2, ate: 10,
});

const criarBloco = (): Bloco => ({
  id: newId(),
  nome: '',
  tipo: 'Torre',
  linhas: 1,
  especiais: [
    criarEspecial('Subsolo', '-1'),
    criarEspecial('Térreo', '0'),
    criarEspecial('Cobertura', ''),
  ],
  repetidos: [criarRepetido()],
});

const gerarPavimentos = (bloco: Bloco) => {
  const lista: { nome: string; numero: number | null }[] = [];

  bloco.especiais.forEach((p) => {
    if (p.nome.trim()) {
      lista.push({
        nome: p.nome.trim(),
        numero: p.numero !== '' ? Number(p.numero) : null,
      });
    }
  });

  bloco.repetidos.forEach((r) => {
    if (r.prefixo.trim() && r.de <= r.ate) {
      for (let i = r.de; i <= r.ate; i++) {
        lista.push({ nome: `${r.prefixo.trim()} ${i}`, numero: i });
      }
    }
  });

  lista.sort((a, b) => {
    if (a.numero === null && b.numero === null) return 0;
    if (a.numero === null) return 1;
    if (b.numero === null) return -1;
    return a.numero - b.numero;
  });

  return lista;
};

// Agrupar pavimentos por bloco (extrato do nome)
const agruparPavimentos = (pavimentos: Pavimento[]): Record<string, Pavimento[]> => {
  const grupos: Record<string, Pavimento[]> = {};

  pavimentos.forEach((pav) => {
    // Extrair nome do bloco (antes do " - ")
    const match = pav.nome.match(/^([^-]+)\s*-\s*(.+)$/);
    const blocoNome = match ? match[1].trim() : 'Sem Bloco';

    if (!grupos[blocoNome]) {
      grupos[blocoNome] = [];
    }
    grupos[blocoNome].push(pav);
  });

  // Ordenar: torres primeiro, depois anexos
  const chaves = Object.keys(grupos).sort((a, b) => {
    // Se contém "Torre" ou "Bloco", vem primeiro
    const aEhTorre = a.toLowerCase().includes('torre') || a.toLowerCase().includes('bloco');
    const bEhTorre = b.toLowerCase().includes('torre') || b.toLowerCase().includes('bloco');

    if (aEhTorre && !bEhTorre) return -1;
    if (!aEhTorre && bEhTorre) return 1;
    return a.localeCompare(b);
  });

  const gruposOrdenados: Record<string, Pavimento[]> = {};
  chaves.forEach((k) => {
    gruposOrdenados[k] = grupos[k].sort((a, b) => {
      // Dentro do grupo, ordenar por número (descrescente: maior no topo)
      const numA = a.numero ?? -Infinity;
      const numB = b.numero ?? -Infinity;
      return numB - numA; // Descrescente: maior primeiro
    });
  });

  return gruposOrdenados;
};

// ─────────────────────────── Componente Principal ───────────────────────────
export default function ObraDetalhes() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [aba, setAba] = useState<'individual' | 'lote'>('individual');
  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<Pavimento[]>([]);
  const [loading, setLoading] = useState(true);

  // Form individual
  const [formData, setFormData] = useState({ nome: '', numero: '' });
  const [submitting, setSubmitting] = useState(false);

  // Form lote
  const [blocos, setBlocos] = useState<Bloco[]>([criarBloco()]);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [expandido, setExpandido] = useState<string[]>([]);
  const [mensagemLote, setMensagemLote] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  // Exclusão
  const [pavimentoParaExcluir, setPavimentoParaExcluir] = useState<Pavimento | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  
  // Exclusão de bloco
  const [blocoParaExcluir, setBlocoParaExcluir] = useState<string | null>(null);
  const [excluindoBloco, setExcluindoBloco] = useState(false);

  // Edição da obra
  const [modalEditarObra, setModalEditarObra] = useState(false);
  const [formObra, setFormObra] = useState({ nome: '', descricao: '', data_inicio: '', data_fim: '' });
  const [salvandoObra, setSalvandoObra] = useState(false);
  const [excluindoObra, setExcluindoObra] = useState(false);
  const [uploadandoFoto, setUploadandoFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Accordion: blocos abertos na lista de pavimentos
  const [blocosAbertos, setBlocosAbertos] = useState<Set<string>>(new Set());

  const toggleBloco = (blocoNome: string) => {
    setBlocosAbertos(prev => {
      const novo = new Set(prev);
      if (novo.has(blocoNome)) {
        novo.delete(blocoNome);
      } else {
        novo.add(blocoNome);
      }
      return novo;
    });
  };

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Credenciais não configuradas');
    return createClient(url, key);
  }, []);

  useEffect(() => {
    fetchObraEPavimentos();
    setBlocos((prev) => {
      const b = [criarBloco()];
      setExpandido([b[0].id]);
      return b;
    });
  }, [obraId, supabase]);

  const fetchObraEPavimentos = async () => {
    try {
      setLoading(true);
      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos').select('*').eq('obra_id', obraId).order('numero', { ascending: false });
      setPavimentos(pavData || []);
    } finally {
      setLoading(false);
    }
  };

  // ─── Editar Obra ───
  const abrirEditarObra = () => {
    if (!obra) return;
    setFormObra({
      nome: obra.nome,
      descricao: obra.descricao || '',
      data_inicio: obra.data_inicio || '',
      data_fim: obra.data_fim || '',
    });
    setModalEditarObra(true);
  };

  const handleSalvarObra = async () => {
    if (!formObra.nome.trim()) return;
    setSalvandoObra(true);
    const { error } = await supabase.from('obras').update({
      nome: formObra.nome.trim(),
      descricao: formObra.descricao.trim() || null,
      data_inicio: formObra.data_inicio || null,
      data_fim: formObra.data_fim || null,
    }).eq('id', obraId);
    if (!error) {
      setModalEditarObra(false);
      await fetchObraEPavimentos();
    } else {
      alert('❌ Erro ao salvar: ' + error.message);
    }
    setSalvandoObra(false);
  };

  const handleExcluirObra = async () => {
    if (!confirm(`Excluir a obra "${obra?.nome}"?\nEsta ação é irreversível e apagará todos os dados.`)) return;
    setExcluindoObra(true);
    try {
      // Deletar manualmente em cascata
      // 1. Subatividades
      const { data: pavs } = await supabase.from('pavimentos').select('id').eq('obra_id', obraId);
      const pavIds = (pavs || []).map(p => p.id);
      if (pavIds.length > 0) {
        const { data: ativs } = await supabase.from('atividades').select('id').in('pavimento_id', pavIds);
        const ativIds = (ativs || []).map(a => a.id);
        if (ativIds.length > 0) {
          await supabase.from('subatividades').delete().in('atividade_id', ativIds);
          await supabase.from('atividades').delete().in('pavimento_id', pavIds);
        }
      }
      // 2. Versões
      await supabase.from('versoes').delete().eq('obra_id', obraId);
      // 3. Pavimentos
      await supabase.from('pavimentos').delete().eq('obra_id', obraId);
      // 4. Obra
      const { error } = await supabase.from('obras').delete().eq('id', obraId);
      if (!error) {
        router.push('/');
      } else {
        alert('❌ Erro ao excluir obra: ' + error.message);
        setExcluindoObra(false);
      }
    } catch (err) {
      alert('❌ Erro: ' + String(err));
      setExcluindoObra(false);
    }
  };

  // ─── Upload de Foto ───
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('❌ Foto muito grande! Máximo 2MB.'); return; }
    setUploadandoFoto(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `obras/${obraId}/foto.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('fotos-obras').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('fotos-obras').getPublicUrl(path);
      const fotoUrl = urlData.publicUrl + '?t=' + Date.now();
      await supabase.from('obras').update({ foto_url: fotoUrl }).eq('id', obraId);
      await fetchObraEPavimentos();
    } catch (err) {
      alert('❌ Erro ao fazer upload: ' + String(err));
    } finally {
      setUploadandoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = '';
    }
  };

  // ─── Form Individual ───
  const handleIndividual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from('pavimentos').insert({
      obra_id: obraId,
      nome: formData.nome,
      numero: formData.numero ? Number(formData.numero) : null,
    });
    if (!error) {
      setFormData({ nome: '', numero: '' });
      await fetchObraEPavimentos();
      alert('✅ Pavimento criado!');
    } else {
      alert('❌ Erro: ' + error.message);
    }
    setSubmitting(false);
  };

  // ─── Exclusão de Pavimento ───
  const handleExcluir = async () => {
    if (!pavimentoParaExcluir) return;

    setExcluindo(true);
    try {
      // Deletar o pavimento (cascade automático deleta atividades)
      const { error } = await supabase
        .from('pavimentos')
        .delete()
        .eq('id', pavimentoParaExcluir.id);

      if (error) {
        alert('❌ Erro ao deletar pavimento: ' + error.message);
      } else {
        setPavimentoParaExcluir(null);
        setExcluindo(false);
        
        // Aguardar um pouco e recarregar dados
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchObraEPavimentos();
        
        alert('✅ Pavimento excluído com sucesso!');
      }
    } catch (error) {
      alert('❌ Erro durante exclusão: ' + String(error));
    } finally {
      setExcluindo(false);
      setPavimentoParaExcluir(null);
    }
  };

  // ─── Exclusão de Bloco Inteiro ───
  const handleExcluirBloco = async () => {
    if (!blocoParaExcluir) return;

    setExcluindoBloco(true);
    try {
      // Buscar todos os pavimentos do bloco
      const pavimentosDoBloco = pavimentos.filter((pav) =>
        pav.nome.startsWith(blocoParaExcluir)
      );

      // Deletar todos os pavimentos do bloco (cascade deleta atividades)
      for (const pav of pavimentosDoBloco) {
        await supabase.from('pavimentos').delete().eq('id', pav.id);
      }

      setBlocoParaExcluir(null);
      setExcluindoBloco(false);

      // Aguardar um pouco e recarregar dados
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchObraEPavimentos();

      alert('✅ Bloco excluído com sucesso!');
    } catch (error) {
      alert('❌ Erro durante exclusão: ' + String(error));
    } finally {
      setExcluindoBloco(false);
      setBlocoParaExcluir(null);
    }
  };

  // ─── Lote: Blocos ───
  const addBloco = () => {
    const b = criarBloco();
    setBlocos((prev) => [...prev, b]);
    setExpandido((prev) => [...prev, b.id]);
  };

  const removeBloco = (id: string) => setBlocos((prev) => prev.filter((b) => b.id !== id));

  const updateBloco = (id: string, campo: 'nome' | 'tipo' | 'linhas', valor: string | number) =>
    setBlocos((prev) => prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));

  const toggleExpandido = (id: string) =>
    setExpandido((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  // ─── Lote: Especiais ───
  const addEspecial = (blocoId: string) =>
    setBlocos((prev) => prev.map((b) => b.id === blocoId ? { ...b, especiais: [...b.especiais, criarEspecial()] } : b));

  const updateEspecial = (blocoId: string, pavId: string, campo: 'nome' | 'numero', valor: string) =>
    setBlocos((prev) => prev.map((b) =>
      b.id === blocoId ? { ...b, especiais: b.especiais.map((p) => p.id === pavId ? { ...p, [campo]: valor } : p) } : b
    ));

  const removeEspecial = (blocoId: string, pavId: string) =>
    setBlocos((prev) => prev.map((b) =>
      b.id === blocoId ? { ...b, especiais: b.especiais.filter((p) => p.id !== pavId) } : b
    ));

  // ─── Lote: Repetidos ───
  const addRepetido = (blocoId: string) =>
    setBlocos((prev) => prev.map((b) => b.id === blocoId ? { ...b, repetidos: [...b.repetidos, criarRepetido()] } : b));

  const updateRepetido = (blocoId: string, repId: string, campo: keyof PavimentoRepetido, valor: string) =>
    setBlocos((prev) => prev.map((b) =>
      b.id === blocoId ? {
        ...b,
        repetidos: b.repetidos.map((r) =>
          r.id === repId ? { ...r, [campo]: campo === 'prefixo' ? valor : Number(valor) } : r
        ),
      } : b
    ));

  const removeRepetido = (blocoId: string, repId: string) =>
    setBlocos((prev) => prev.map((b) =>
      b.id === blocoId ? { ...b, repetidos: b.repetidos.filter((r) => r.id !== repId) } : b
    ));

  // ─── Salvar Lote ───
  const totalPavimentos = blocos.reduce((acc, b) => acc + gerarPavimentos(b).length, 0);

  const handleSalvarLote = async () => {
    // Validar se todos os blocos têm nome
    const blocosSeNome = blocos.filter((b) => !b.nome.trim());
    if (blocosSeNome.length > 0) {
      setMensagemLote({
        tipo: 'error',
        texto: `❌ ${blocosSeNome.length} bloco(s) sem nome! Todos os blocos precisam de um nome.`,
      });
      return;
    }

    if (totalPavimentos === 0) {
      setMensagemLote({ tipo: 'error', texto: '❌ Nenhum pavimento para criar!' });
      return;
    }

    setSalvandoLote(true);
    setMensagemLote(null);
    let criados = 0;

    for (const bloco of blocos) {
      const pavs = gerarPavimentos(bloco);
      const meta = `__BLOCO__tipo=${bloco.tipo}||obs=||linhas=${bloco.linhas}`;
      for (let i = 0; i < pavs.length; i++) {
        const pav = pavs[i];
        const nomeFinal = `${bloco.nome.trim()} - ${pav.nome}`;
        const { error } = await supabase.from('pavimentos').insert({
          obra_id: obraId,
          nome: nomeFinal,
          numero: pav.numero,
          observacao: i === 0 ? meta : null,
        });
        if (!error) criados++;
      }
    }

    setMensagemLote({ tipo: 'success', texto: `✅ ${criados} pavimentos criados com sucesso!` });
    await fetchObraEPavimentos();
    setSalvandoLote(false);
    setTimeout(() => setMensagemLote(null), 4000);
  };

  // ─── Agrupar pavimentos ───
  const pavimentosAgrupados = agruparPavimentos(pavimentos);

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

  if (!obra) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 mb-4">❌ Obra não encontrada</p>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg">← Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Input oculto para foto */}
      <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <button onClick={() => router.push('/')} className="text-blue-600 hover:text-blue-700 font-semibold text-lg flex-shrink-0">
                ← Voltar
              </button>

              {/* Foto da obra */}
              <div
                className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 border-2 border-slate-200 cursor-pointer hover:border-blue-400 transition-colors group"
                onClick={() => fotoInputRef.current?.click()}
                title="Clique para alterar a foto"
              >
                {obra.foto_url ? (
                  <img src={obra.foto_url} alt={obra.nome} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🏗️</div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-bold">{uploadandoFoto ? '⏳' : '📷'}</span>
                </div>
              </div>

              {/* Nome e descrição */}
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-bold text-slate-900 truncate">{obra.nome}</h1>
                {obra.descricao && <p className="text-sm text-slate-500 mt-0.5 truncate">{obra.descricao}</p>}
              </div>
            </div>

            {/* Botões */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={abrirEditarObra}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => router.push(`/obras/${obraId}/dashboard`)}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                📋 Dashboard
              </button>
              <button
                onClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                📊 Linha de Balanço
              </button>
            </div>
          </div>
        </div>
      </header>

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

        {/* ABAS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setAba('individual')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                aba === 'individual'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              🏢 Estrutura da Obra
            </button>
            <button
              onClick={() => setAba('lote')}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                aba === 'lote'
                  ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              🏗️ Nova Estrutura
              {totalPavimentos > 0 && aba === 'lote' && (
                <span className="ml-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {totalPavimentos}
                </span>
              )}
            </button>
          </div>

          {/* ─── ABA INDIVIDUAL (ESTRUTURA DA OBRA) ─── */}
          {aba === 'individual' && (
            <div className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Pavimentos ({pavimentos.length})
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Estrutura atual da obra</p>
                </div>
                <button
                  onClick={() => setAba('lote')}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                  🏗️ + Nova Estrutura
                </button>
              </div>

              {/* Lista Agrupada por Blocos */}

                  {pavimentos.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-slate-500 mb-2">🏗️ Nenhum pavimento criado ainda</p>
                      <p className="text-slate-400 text-sm">Crie individual ou use a aba "Criação em Lote"</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(pavimentosAgrupados).map(([blocoNome, pavs]) => {
                        // Ler tipo e observação do meta salvo no 1º pavimento
                        const PREFIXO = '__BLOCO__';
                        const primeiroPav = pavs[0];
                        let tipoDoBloco = '';
                        let obsDoBloco = '';

                        if (primeiroPav?.observacao?.startsWith(PREFIXO)) {
                          const raw = primeiroPav.observacao.replace(PREFIXO, '');
                          const partes = raw.split('||');
                          tipoDoBloco = partes.find((p: string) => p.startsWith('tipo='))?.replace('tipo=', '') || '';
                          obsDoBloco = partes.find((p: string) => p.startsWith('obs='))?.replace('obs=', '') || '';
                        }

                        return (
                          <div key={blocoNome} className="border-2 border-slate-200 rounded-lg overflow-hidden">
                            {/* Header do Bloco — clicável para abrir/fechar */}
                            <div
                              className="bg-slate-50 border-b border-slate-200 px-4 py-4 flex items-center justify-between group hover:bg-slate-100 transition-colors cursor-pointer select-none"
                              onClick={() => toggleBloco(blocoNome)}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <span className="text-xl">{blocoNome.toLowerCase().includes('torre') || blocoNome.toLowerCase().includes('bloco') ? '🏢' : '🏊'}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-slate-900 text-base">{blocoNome}</h3>
                                    {tipoDoBloco && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
                                        {tipoDoBloco}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <p className="text-xs text-slate-500">📋 {pavs.length} pavimentos</p>
                                    {obsDoBloco && (
                                      <p className="text-xs text-slate-500 italic">💬 {obsDoBloco.length > 50 ? obsDoBloco.substring(0, 50) + '...' : obsDoBloco}</p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Botões + seta */}
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/obras/${obraId}/editar-bloco/${encodeURIComponent(blocoNome)}`); }}
                                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setBlocoParaExcluir(blocoNome); }}
                                  className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  🗑️ Excluir
                                </button>
                                <span className={`text-slate-400 text-lg font-bold transition-transform duration-200 ${blocosAbertos.has(blocoNome) ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </div>
                            </div>

                            {/* Pavimentos — só aparece se estiver aberto */}
                            {blocosAbertos.has(blocoNome) && (
                              <div className="divide-y divide-slate-100">
                                {pavs.map((pav) => (
                                  <div key={pav.id} className="p-4 hover:bg-blue-50 transition-colors flex items-start justify-between group">
                                    <div className="flex-1">
                                      <p className="font-semibold text-slate-900">{pav.nome}</p>
                                      {pav.numero !== null && (
                                        <p className="text-slate-500 text-xs mt-1">📍 Número: {pav.numero}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                      <button
                                        onClick={() => router.push(`/obras/${obraId}/pavimentos/${pav.id}`)}
                                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        Atividades
                                      </button>
                                      <button
                                        onClick={() => setPavimentoParaExcluir(pav)}
                                        className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        🗑️ Excluir
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
            </div>
          )}

          {/* ─── ABA LOTE ─── */}
          {aba === 'lote' && (
            <div className="p-6">
              {/* Mensagem */}
              {mensagemLote && (
                <div className={`mb-6 p-4 rounded-lg border font-medium ${
                  mensagemLote.tipo === 'success'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {mensagemLote.texto}
                </div>
              )}

              {/* Barra superior */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-3">
                  <button
                    onClick={addBloco}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    + Novo Bloco / Torre / Anexo
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  {blocos.some((b) => !b.nome.trim()) && (
                    <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                      <p className="text-sm font-bold text-yellow-800">⚠️ Blocos sem nome</p>
                      <p className="text-xs text-yellow-600">Todos precisam de um nome</p>
                    </div>
                  )}
                  <div className="text-center bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                    <p className="text-xl font-bold text-green-600">{totalPavimentos}</p>
                    <p className="text-xs text-green-500">pavimentos</p>
                  </div>
                  <button
                    onClick={handleSalvarLote}
                    disabled={salvandoLote || totalPavimentos === 0 || blocos.some((b) => !b.nome.trim())}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors text-sm"
                  >
                    {salvandoLote ? '⏳ Criando...' : `✨ Criar ${totalPavimentos} Pavimentos`}
                  </button>
                </div>
              </div>

              {/* Blocos */}
              <div className="space-y-4">
                {blocos.map((bloco) => {
                  const isExp = expandido.includes(bloco.id);
                  const preview = gerarPavimentos(bloco);

                  return (
                    <div key={bloco.id} className="border-2 border-slate-200 rounded-xl overflow-hidden">
                      {/* Header do bloco */}
                      <div
                        className={`flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-100 transition-colors ${
                          !bloco.nome.trim() ? 'bg-yellow-50 border-b-2 border-yellow-200' : 'bg-slate-50'
                        }`}
                        onClick={() => toggleExpandido(bloco.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🏢</span>
                          <div>
                            <p className={`font-bold ${!bloco.nome.trim() ? 'text-yellow-800' : 'text-slate-900'}`}>
                              {bloco.nome ? bloco.nome : <span className="text-yellow-600">⚠️ Sem nome (obrigatório)</span>}
                              {bloco.tipo ? <span className="ml-2 text-xs font-normal text-slate-500">({bloco.tipo})</span> : null}
                            </p>
                            <p className="text-xs text-slate-500">{preview.length} pavimentos configurados</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeBloco(bloco.id); }}
                            className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded"
                          >
                            🗑️ Remover
                          </button>
                          <span className="text-slate-400">{isExp ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Conteúdo */}
                      {isExp && (
                        <div className="p-5">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Formulário */}
                            <div className="space-y-5">
                              {/* Nome e tipo (livre) */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Nome do Bloco</label>
                                  <input
                                    type="text"
                                    value={bloco.nome}
                                    onChange={(e) => updateBloco(bloco.id, 'nome', e.target.value)}
                                    placeholder="Ex: Torre A, Bloco B"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Tipo (livre)</label>
                                  <input
                                    type="text"
                                    value={bloco.tipo}
                                    onChange={(e) => updateBloco(bloco.id, 'tipo', e.target.value)}
                                    placeholder="Ex: Torre, Anexo, Garagem"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-slate-400 -mt-2">
                                O nome será prefixado: <strong>{bloco.nome || 'Bloco'} - Térreo</strong>, <strong>{bloco.nome || 'Bloco'} - Andar 2</strong>...
                              </p>

                              {/* Linhas por pavimento */}
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <label className="text-xs font-semibold text-blue-800 mb-2 block">📊 Linhas por Pavimento na Linha de Balanço</label>
                                <p className="text-xs text-blue-600 mb-3">Quantas linhas de atividade cada pavimento ocupa no gráfico (1 a 5)</p>
                                <div className="flex gap-2">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => updateBloco(bloco.id, 'linhas', n)}
                                      className={`w-10 h-10 rounded-lg font-bold text-sm transition-colors ${
                                        bloco.linhas === n
                                          ? 'bg-blue-600 text-white shadow'
                                          : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-100'
                                      }`}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Pavimentos Especiais */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="text-sm font-semibold text-slate-700">📍 Pavimentos com Nomes Únicos</label>
                                  <button
                                    onClick={() => addEspecial(bloco.id)}
                                    className="text-blue-600 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                                  >
                                    + Adicionar
                                  </button>
                                </div>
                                <p className="text-xs text-slate-400 mb-3">
                                  Subsolo, Térreo, Cobertura, Platibanda, Piscina, Quiosque...
                                </p>
                                <div className="space-y-2">
                                  {bloco.especiais.map((pav) => (
                                    <div key={pav.id} className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={pav.nome}
                                        onChange={(e) => updateEspecial(bloco.id, pav.id, 'nome', e.target.value)}
                                        placeholder="Nome do pavimento"
                                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 text-sm"
                                      />
                                      <input
                                        type="number"
                                        value={pav.numero}
                                        onChange={(e) => updateEspecial(bloco.id, pav.id, 'numero', e.target.value)}
                                        placeholder="Nº"
                                        className="w-16 px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 text-sm text-center"
                                      />
                                      <button
                                        onClick={() => removeEspecial(bloco.id, pav.id)}
                                        className="text-red-400 hover:text-red-600 text-xl w-8 h-8 flex items-center justify-center"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Pavimentos Repetidos */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="text-sm font-semibold text-slate-700">🔁 Pavimentos em Série</label>
                                  <button
                                    onClick={() => addRepetido(bloco.id)}
                                    className="text-blue-600 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                                  >
                                    + Adicionar
                                  </button>
                                </div>
                                <p className="text-xs text-slate-400 mb-3">
                                  Prefixo customizado: "Apto" vira Apto 2, Apto 3... "Andar" vira Andar 2, Andar 3...
                                </p>
                                <div className="space-y-3">
                                  {bloco.repetidos.map((rep) => (
                                    <div key={rep.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                      <div className="flex items-end gap-2 flex-wrap">
                                        <div className="flex-1 min-w-28">
                                          <label className="text-xs text-slate-500 mb-1 block">Prefixo customizado</label>
                                          <input
                                            type="text"
                                            value={rep.prefixo}
                                            onChange={(e) => updateRepetido(bloco.id, rep.id, 'prefixo', e.target.value)}
                                            placeholder="Ex: Apto, Andar, Piso, Sala"
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 text-sm"
                                          />
                                        </div>
                                        <div className="w-20">
                                          <label className="text-xs text-slate-500 mb-1 block">Do nº</label>
                                          <input
                                            type="number"
                                            value={rep.de}
                                            onChange={(e) => updateRepetido(bloco.id, rep.id, 'de', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 text-sm text-center"
                                          />
                                        </div>
                                        <div className="w-20">
                                          <label className="text-xs text-slate-500 mb-1 block">Até nº</label>
                                          <input
                                            type="number"
                                            value={rep.ate}
                                            onChange={(e) => updateRepetido(bloco.id, rep.id, 'ate', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-slate-200 rounded outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 text-sm text-center"
                                          />
                                        </div>
                                        <button
                                          onClick={() => removeRepetido(bloco.id, rep.id)}
                                          className="text-red-400 hover:text-red-600 text-xl pb-1"
                                        >
                                          ×
                                        </button>
                                      </div>
                                      <p className="text-xs text-blue-600 mt-2 font-medium">
                                        {rep.de <= rep.ate
                                          ? `→ Gera: ${rep.prefixo} ${rep.de}, ${rep.prefixo} ${rep.de + 1}... ${rep.prefixo} ${rep.ate} (${rep.ate - rep.de + 1} pavimentos)`
                                          : '⚠️ Número inicial deve ser menor que o final'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Preview */}
                            <div>
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sticky top-4">
                                <p className="text-sm font-semibold text-slate-700 mb-3">
                                  👁️ Preview — {preview.length} pavimentos
                                </p>
                                {preview.length === 0 ? (
                                  <p className="text-slate-400 text-sm text-center py-8">Nenhum pavimento configurado</p>
                                ) : (
                                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                                    {preview.map((pav, i) => (
                                      <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                                        <span className="text-sm font-medium text-slate-800">
                                          {bloco.nome ? `${bloco.nome} - ${pav.nome}` : pav.nome}
                                        </span>
                                        {pav.numero !== null && (
                                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold ml-2">
                                            Nº {pav.numero}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Botão Salvar Final */}
              {totalPavimentos > 0 && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSalvarLote}
                    disabled={salvandoLote}
                    className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors"
                  >
                    {salvandoLote ? '⏳ Criando...' : `✨ Criar ${totalPavimentos} Pavimentos`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal de Confirmação de Exclusão */}
      {pavimentoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-600 mb-2">Você tem certeza que deseja excluir?</p>
            <p className="text-slate-900 font-semibold mb-6 p-3 bg-slate-100 rounded-lg">
              {pavimentoParaExcluir.nome}
            </p>
            <p className="text-sm text-slate-500 mb-6">
              ⚠️ Esta ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPavimentoParaExcluir(null)}
                disabled={excluindo}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={excluindo}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-colors"
              >
                {excluindo ? '⏳ Excluindo...' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Bloco */}
      {blocoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-600 mb-2">Você tem certeza que deseja excluir o bloco inteiro?</p>
            <p className="text-slate-900 font-semibold mb-6 p-3 bg-slate-100 rounded-lg">
              {blocoParaExcluir}
            </p>
            <p className="text-sm text-red-600 mb-6 font-semibold">
              ⚠️ Todos os {pavimentos.filter((p) => p.nome.startsWith(blocoParaExcluir)).length} pavimentos e suas atividades serão deletados!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBlocoParaExcluir(null)}
                disabled={excluindoBloco}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluirBloco}
                disabled={excluindoBloco}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-colors"
              >
                {excluindoBloco ? '⏳ Excluindo...' : '🗑️ Excluir Bloco'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Obra */}
      {modalEditarObra && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-5">✏️ Editar Obra</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome *</label>
                <input type="text" value={formObra.nome}
                  onChange={e => setFormObra(p => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea value={formObra.descricao}
                  onChange={e => setFormObra(p => ({ ...p, descricao: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label>
                  <input type="date" value={formObra.data_inicio}
                    onChange={e => setFormObra(p => ({ ...p, data_inicio: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Data Fim</label>
                  <input type="date" value={formObra.data_fim}
                    onChange={e => setFormObra(p => ({ ...p, data_fim: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>

              {/* Foto */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Foto da Obra</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    {obra?.foto_url
                      ? <img src={obra.foto_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-2xl">🏗️</span>
                    }
                  </div>
                  <button type="button"
                    onClick={() => { setModalEditarObra(false); setTimeout(() => fotoInputRef.current?.click(), 100); }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {uploadandoFoto ? '⏳ Enviando...' : '📷 Alterar foto'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {/* Excluir obra */}
              <button
                onClick={() => { setModalEditarObra(false); handleExcluirObra(); }}
                disabled={excluindoObra || salvandoObra}
                className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold text-sm transition-colors"
              >
                {excluindoObra ? '⏳' : '🗑️ Excluir'}
              </button>
              <button onClick={() => setModalEditarObra(false)} disabled={salvandoObra}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSalvarObra} disabled={salvandoObra || !formObra.nome.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold">
                {salvandoObra ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
