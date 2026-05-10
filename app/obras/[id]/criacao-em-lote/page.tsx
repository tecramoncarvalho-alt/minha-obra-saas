'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { createClient } from '@/lib/supabase/client';

// ─────────────────────────── Tipos ───────────────────────────
interface PavimentoEspecial {
  id: string;
  nome: string;
  numero: number | string;
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
  tipo: 'torre' | 'anexo';
  especiais: PavimentoEspecial[];
  repetidos: PavimentoRepetido[];
}

// ─────────────────────────── Helpers ───────────────────────────
let uid = 0;
const newId = () => `${++uid}`;

const criarPavimentoEspecial = (nome = '', numero: number | string = ''): PavimentoEspecial => ({
  id: newId(),
  nome,
  numero,
});

const criarPavimentoRepetido = (): PavimentoRepetido => ({
  id: newId(),
  prefixo: 'Andar',
  de: 2,
  ate: 10,
});

const criarBloco = (tipo: 'torre' | 'anexo' = 'torre'): Bloco => ({
  id: newId(),
  nome: tipo === 'torre' ? 'Torre A' : 'Anexo',
  tipo,
  especiais: [
    criarPavimentoEspecial('Subsolo', -1),
    criarPavimentoEspecial('Térreo', 0),
    criarPavimentoEspecial('Cobertura', ''),
  ],
  repetidos: [criarPavimentoRepetido()],
});

// Gerar lista de pavimentos para preview
const gerarPavimentos = (bloco: Bloco): { nome: string; numero: number | null }[] => {
  const lista: { nome: string; numero: number | null }[] = [];

  // Pavimentos especiais
  bloco.especiais.forEach((p) => {
    if (p.nome.trim()) {
      lista.push({
        nome: p.nome.trim(),
        numero: p.numero !== '' ? Number(p.numero) : null,
      });
    }
  });

  // Pavimentos repetidos
  bloco.repetidos.forEach((r) => {
    if (r.prefixo.trim() && r.de <= r.ate) {
      for (let i = r.de; i <= r.ate; i++) {
        lista.push({
          nome: `${r.prefixo.trim()} ${i}`,
          numero: i,
        });
      }
    }
  });

  // Ordenar por número (nulls no final)
  lista.sort((a, b) => {
    if (a.numero === null && b.numero === null) return 0;
    if (a.numero === null) return 1;
    if (b.numero === null) return -1;
    return a.numero - b.numero;
  });

  return lista;
};

// ─────────────────────────── Componente ───────────────────────────
export default function CriacaoEmLote() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);
  const { role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'planejador') {
      router.replace(`/obras/${obraId}`);
    }
  }, [authLoading, role, obraId, router]);

  const [blocos, setBlocos] = useState<Bloco[]>([criarBloco('torre')]);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [expandido, setExpandido] = useState<string[]>([blocos[0].id]);

  const supabase = createClient();

  // Total de pavimentos que serão criados
  const totalPavimentos = blocos.reduce(
    (acc, b) => acc + gerarPavimentos(b).length, 0
  );

  // ─── Handlers de Bloco ───
  const addBloco = (tipo: 'torre' | 'anexo') => {
    const b = criarBloco(tipo);
    setBlocos((prev) => [...prev, b]);
    setExpandido((prev) => [...prev, b.id]);
  };

  const removeBloco = (id: string) => {
    setBlocos((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBloco = (id: string, campo: keyof Bloco, valor: string) => {
    setBlocos((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b))
    );
  };

  const toggleExpandido = (id: string) => {
    setExpandido((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // ─── Handlers de Pavimento Especial ───
  const addEspecial = (blocoId: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? { ...b, especiais: [...b.especiais, criarPavimentoEspecial()] }
          : b
      )
    );
  };

  const updateEspecial = (blocoId: string, pavId: string, campo: keyof PavimentoEspecial, valor: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              especiais: b.especiais.map((p) =>
                p.id === pavId ? { ...p, [campo]: valor } : p
              ),
            }
          : b
      )
    );
  };

  const removeEspecial = (blocoId: string, pavId: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? { ...b, especiais: b.especiais.filter((p) => p.id !== pavId) }
          : b
      )
    );
  };

  // ─── Handlers de Pavimento Repetido ───
  const addRepetido = (blocoId: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? { ...b, repetidos: [...b.repetidos, criarPavimentoRepetido()] }
          : b
      )
    );
  };

  const updateRepetido = (blocoId: string, repId: string, campo: keyof PavimentoRepetido, valor: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              repetidos: b.repetidos.map((r) =>
                r.id === repId
                  ? {
                      ...r,
                      [campo]: campo === 'prefixo' ? valor : Number(valor),
                    }
                  : r
              ),
            }
          : b
      )
    );
  };

  const removeRepetido = (blocoId: string, repId: string) => {
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === blocoId
          ? { ...b, repetidos: b.repetidos.filter((r) => r.id !== repId) }
          : b
      )
    );
  };

  // ─── Salvar no Supabase ───
  const handleSalvar = async () => {
    if (totalPavimentos === 0) {
      setMensagem({ tipo: 'error', texto: '❌ Nenhum pavimento para criar!' });
      return;
    }

    setSalvando(true);
    setMensagem(null);

    try {
      let totalCriados = 0;

      for (const bloco of blocos) {
        const pavimentos = gerarPavimentos(bloco);

        for (const pav of pavimentos) {
          const nomeFinal = bloco.nome.trim()
            ? `${bloco.nome} - ${pav.nome}`
            : pav.nome;

          const { error } = await supabase.from('pavimentos').insert({
            obra_id: obraId,
            nome: nomeFinal,
            numero: pav.numero,
          });

          if (!error) totalCriados++;
        }
      }

      setMensagem({
        tipo: 'success',
        texto: `✅ ${totalCriados} pavimentos criados com sucesso!`,
      });

      // Redirecionar após 2 segundos
      setTimeout(() => {
        router.push(`/obras/${obraId}`);
      }, 2000);
    } catch (error) {
      setMensagem({ tipo: 'error', texto: '❌ Erro ao criar pavimentos' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/obras/${obraId}`)}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                ← Voltar
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">🏗️ Criação em Lote de Pavimentos</h1>
                <p className="text-sm text-slate-500">Crie torres, blocos e anexos com todos os pavimentos de uma vez</p>
              </div>
            </div>

            {/* Contador + Botão Salvar */}
            <div className="flex items-center gap-4">
              <div className="text-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <p className="text-2xl font-bold text-blue-600">{totalPavimentos}</p>
                <p className="text-xs text-blue-500">pavimentos</p>
              </div>
              <button
                onClick={handleSalvar}
                disabled={salvando || totalPavimentos === 0}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors text-sm"
              >
                {salvando ? '⏳ Criando...' : `✨ Criar ${totalPavimentos} Pavimentos`}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Mensagem */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-lg border font-medium ${
              mensagem.tipo === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {/* Botões para adicionar blocos */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => addBloco('torre')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            🏢 + Nova Torre / Bloco
          </button>
          <button
            onClick={() => addBloco('anexo')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            🏊 + Novo Anexo
          </button>
        </div>

        {/* Lista de Blocos */}
        <div className="space-y-4">
          {blocos.map((bloco) => {
            const isExpanded = expandido.includes(bloco.id);
            const preview = gerarPavimentos(bloco);

            return (
              <div
                key={bloco.id}
                className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden ${
                  bloco.tipo === 'torre'
                    ? 'border-blue-200'
                    : 'border-purple-200'
                }`}
              >
                {/* Header do Bloco */}
                <div
                  className={`flex items-center justify-between px-5 py-4 cursor-pointer ${
                    bloco.tipo === 'torre' ? 'bg-blue-50' : 'bg-purple-50'
                  }`}
                  onClick={() => toggleExpandido(bloco.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{bloco.tipo === 'torre' ? '🏢' : '🏊'}</span>
                    <div>
                      <p className="font-bold text-slate-900">{bloco.nome || 'Sem nome'}</p>
                      <p className="text-xs text-slate-500">
                        {preview.length} pavimentos · {bloco.tipo === 'torre' ? 'Torre/Bloco' : 'Anexo'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {blocos.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBloco(bloco.id);
                        }}
                        className="text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1 rounded"
                      >
                        🗑️ Remover
                      </button>
                    )}
                    <span className="text-slate-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Conteúdo do Bloco */}
                {isExpanded && (
                  <div className="p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Lado Esquerdo: Formulário */}
                      <div className="space-y-5">
                        {/* Nome do Bloco */}
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Nome do {bloco.tipo === 'torre' ? 'Bloco/Torre' : 'Anexo'}
                          </label>
                          <input
                            type="text"
                            value={bloco.nome}
                            onChange={(e) => updateBloco(bloco.id, 'nome', e.target.value)}
                            placeholder="Ex: Torre A, Bloco 1, Área de Lazer"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                          />
                          <p className="text-xs text-slate-400 mt-1">
                            Este nome será prefixado em cada pavimento (ex: Torre A - Térreo)
                          </p>
                        </div>

                        {/* Pavimentos Especiais */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-700">
                              📍 Pavimentos Especiais
                            </label>
                            <button
                              onClick={() => addEspecial(bloco.id)}
                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold px-2 py-1 border border-blue-200 rounded"
                            >
                              + Adicionar
                            </button>
                          </div>
                          <p className="text-xs text-slate-400 mb-3">
                            Pavimentos com nomes únicos: Subsolo, Térreo, Cobertura, Platibanda, Caixa d'Água...
                          </p>

                          <div className="space-y-2">
                            {bloco.especiais.map((pav) => (
                              <div key={pav.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={pav.nome}
                                  onChange={(e) => updateEspecial(bloco.id, pav.id, 'nome', e.target.value)}
                                  placeholder="Nome (ex: Térreo)"
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
                                  className="text-red-400 hover:text-red-600 text-lg w-8 h-8 flex items-center justify-center rounded"
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
                            <label className="text-sm font-semibold text-slate-700">
                              🔁 Pavimentos Repetidos (em série)
                            </label>
                            <button
                              onClick={() => addRepetido(bloco.id)}
                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold px-2 py-1 border border-blue-200 rounded"
                            >
                              + Adicionar
                            </button>
                          </div>
                          <p className="text-xs text-slate-400 mb-3">
                            Pavimentos numerados em sequência: ex "Andar" do 2 ao 16 cria 15 pavimentos automaticamente
                          </p>

                          <div className="space-y-3">
                            {bloco.repetidos.map((rep) => (
                              <div key={rep.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex-1 min-w-24">
                                    <label className="text-xs text-slate-500 mb-1 block">Prefixo</label>
                                    <input
                                      type="text"
                                      value={rep.prefixo}
                                      onChange={(e) => updateRepetido(bloco.id, rep.id, 'prefixo', e.target.value)}
                                      placeholder="Ex: Andar, Piso"
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
                                    className="text-red-400 hover:text-red-600 text-lg mt-4"
                                  >
                                    ×
                                  </button>
                                </div>
                                <p className="text-xs text-blue-600 mt-2 font-medium">
                                  {rep.de <= rep.ate
                                    ? `→ Cria: ${rep.prefixo} ${rep.de}, ${rep.prefixo} ${rep.de + 1}... ${rep.prefixo} ${rep.ate} (${rep.ate - rep.de + 1} pavimentos)`
                                    : '⚠️ Número inicial deve ser menor que o final'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Preview */}
                      <div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-full">
                          <p className="text-sm font-semibold text-slate-700 mb-3">
                            👁️ Preview ({preview.length} pavimentos)
                          </p>

                          {preview.length === 0 ? (
                            <p className="text-slate-400 text-sm text-center py-8">
                              Nenhum pavimento configurado
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                              {preview.map((pav, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2"
                                >
                                  <span className="text-sm font-medium text-slate-800">
                                    {bloco.nome ? `${bloco.nome} - ${pav.nome}` : pav.nome}
                                  </span>
                                  {pav.numero !== null && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
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
        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={() => router.push(`/obras/${obraId}`)}
            className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || totalPavimentos === 0}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-colors"
          >
            {salvando ? '⏳ Criando...' : `✨ Criar ${totalPavimentos} Pavimentos`}
          </button>
        </div>
      </main>
    </div>
  );
}
