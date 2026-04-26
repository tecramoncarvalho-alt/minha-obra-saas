'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─── Interfaces ───
interface Obra { id: number; nome: string; data_inicio: string | null; data_fim: string | null; }
interface Pavimento { id: number; obra_id: number; nome: string; numero: number | null; }
interface Subatividade {
  id: number; atividade_id: number; nome: string;
  duracao: number; equipe: string | null; efetivo: number | null; ordem: number;
}
interface Atividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  efetivo: number | null;
  subatividades: Subatividade[];
  pavimento?: Pavimento;
}
interface Versao {
  id: number; obra_id: number; nome: string; descricao: string | null;
  status: 'Definitiva' | 'Em Atualização';
  snapshot: { pavimentos: any[] };
  created_at: string;
}
interface ItemEfetivo {
  equipe: string;
  efetivo: number;
  atividades: { nome: string; pavimento: string; subNome?: string }[];
}

// ─── Helpers ───
const toStr = (d: Date) => d.toISOString().split('T')[0];
const parseDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const fmtDate = (s: string) => parseDate(s).toLocaleDateString('pt-BR');
const fmtDiaSemana = (s: string) => parseDate(s).toLocaleDateString('pt-BR', { weekday: 'long' });
const hoje = () => toStr(new Date());

const estaNoIntervalo = (data: string, inicio: string, fim: string) => {
  const d = parseDate(data), i = parseDate(inicio), f = parseDate(fim);
  return d >= i && d <= f;
};

// Cores por equipe
const CORES_EQUIPE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];
const coresEquipe: Record<string,string> = {};
let ceIdx = 0;
const getCorEquipe = (equipe: string) => {
  if (!coresEquipe[equipe]) coresEquipe[equipe] = CORES_EQUIPE[ceIdx++ % CORES_EQUIPE.length];
  return coresEquipe[equipe];
};

export default function Dashboard() {
  const params = useParams();
  const router = useRouter();
  const obraId = Number(params.id);

  const [obra, setObra] = useState<Obra | null>(null);
  const [pavimentos, setPavimentos] = useState<Pavimento[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState(hoje());

  // Versões
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoSelecionada, setVersaoSelecionada] = useState<Versao | null>(null);
  const [modoVersao, setModoVersao] = useState(false);

  // Relatórios
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [tipoRelatorio, setTipoRelatorio] = useState<'dia' | 'semana' | 'mes'>('dia');

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => { fetchDados(); fetchVersoes(); }, [obraId, supabase]);

  const fetchVersoes = async () => {
    const { data } = await supabase
      .from('versoes').select('*').eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setVersoes(data as Versao[]);
      // Carregar definitiva mais recente por padrão
      const definitiva = (data as Versao[]).find(v => v.status === 'Definitiva');
      if (definitiva) {
        setVersaoSelecionada(definitiva);
        setModoVersao(true);
      }
    }
  };

  // Atividades: do banco (ao vivo) ou do snapshot da versão
  const atividadesEfetivas = useMemo((): Atividade[] => {
    if (modoVersao && versaoSelecionada) {
      // Montar atividades a partir do snapshot
      return (versaoSelecionada.snapshot.pavimentos || []).flatMap((pav: any) =>
        (pav.atividades || []).map((at: any) => ({
          ...at,
          subatividades: at.subatividades || [],
          pavimento: { id: pav.id, nome: pav.nome, numero: pav.numero, obra_id: obraId },
        }))
      );
    }
    return atividades;
  }, [modoVersao, versaoSelecionada, atividades, obraId]);

  const fetchDados = async () => {
    try {
      setLoading(true);

      const { data: obraData } = await supabase.from('obras').select('*').eq('id', obraId).single();
      if (obraData) setObra(obraData);

      const { data: pavData } = await supabase
        .from('pavimentos').select('*').eq('obra_id', obraId);
      setPavimentos(pavData || []);

      const pavIds = (pavData || []).map(p => p.id);
      if (pavIds.length === 0) { setLoading(false); return; }

      // Buscar atividades — sem filtro de data (filtramos no front)
      const { data: atData, error: atError } = await supabase
        .from('atividades')
        .select('*')
        .in('pavimento_id', pavIds);

      if (atError) {
        console.error('Erro ao buscar atividades:', atError);
        setLoading(false);
        return;
      }

      console.log('Atividades encontradas:', atData?.length, atData);

      const atIds = (atData || []).map(a => a.id);

      // Buscar subatividades — tratar se tabela não existir
      let subData: Subatividade[] = [];
      if (atIds.length > 0) {
        const { data: subResult, error: subError } = await supabase
          .from('subatividades')
          .select('*')
          .in('atividade_id', atIds)
          .order('ordem');

        if (subError) {
          console.warn('Subatividades não disponíveis:', subError.message);
        } else {
          subData = subResult || [];
        }
      }

      console.log('Subatividades encontradas:', subData.length, subData);

      // Montar mapa
      const pavMap = Object.fromEntries((pavData || []).map(p => [p.id, p]));
      const subMap: Record<number, Subatividade[]> = {};
      subData.forEach(s => {
        if (!subMap[s.atividade_id]) subMap[s.atividade_id] = [];
        subMap[s.atividade_id].push(s);
      });

      const ativsCompletas: Atividade[] = (atData || []).map(a => ({
        ...a,
        equipe: a.equipe ?? null,
        efetivo: a.efetivo ?? null,
        subatividades: (subMap[a.id] || []).map(s => ({
          ...s,
          equipe: s.equipe ?? null,
          efetivo: s.efetivo ?? null,
        })),
        pavimento: pavMap[a.pavimento_id],
      }));

      console.log('Atividades completas montadas:', ativsCompletas.length);
      setAtividades(ativsCompletas);
    } catch (err) {
      console.error('Erro geral no fetchDados:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Atividades do dia selecionado ───
  const atividadesDoDia = useMemo(() => {
    return atividadesEfetivas.filter(a =>
      estaNoIntervalo(dataSelecionada, a.data_inicio, a.data_fim)
    );
  }, [atividadesEfetivas, dataSelecionada]);

  // ─── Calcular efetivo do dia ───
  const efetivoDoDia = useMemo((): ItemEfetivo[] => {
    const mapa: Record<string, ItemEfetivo> = {};

    const garantirEquipe = (chave: string) => {
      if (!mapa[chave]) mapa[chave] = { equipe: chave, efetivo: 0, atividades: [] };
    };

    atividadesDoDia.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento';

      if (at.subatividades && at.subatividades.length > 0) {
        // ── Atividade com subatividades ──
        // Agrupar subatividades por equipe para evitar duplicatas
        const subsPorEquipe: Record<string, { efetivo: number; nomes: string[] }> = {};

        at.subatividades.forEach(sub => {
          // Equipe da sub tem prioridade; fallback para equipe da atividade pai
          const equipeChave = (sub.equipe?.trim()) || (at.equipe?.trim()) || 'Sem equipe';
          if (!subsPorEquipe[equipeChave]) subsPorEquipe[equipeChave] = { efetivo: 0, nomes: [] };
          if (sub.efetivo && sub.efetivo > 0) subsPorEquipe[equipeChave].efetivo += sub.efetivo;
          subsPorEquipe[equipeChave].nomes.push(sub.nome);
        });

        Object.entries(subsPorEquipe).forEach(([equipeChave, dados]) => {
          garantirEquipe(equipeChave);
          mapa[equipeChave].efetivo += dados.efetivo;
          // Uma entrada por atividade (com subNomes concatenados)
          mapa[equipeChave].atividades.push({
            nome: at.nome,
            pavimento: nomePav,
            subNome: dados.nomes.join(', '),
          });
        });

      } else {
        // ── Atividade simples sem subatividades ──
        const equipeChave = at.equipe?.trim() || 'Sem equipe';
        garantirEquipe(equipeChave);
        // Somar efetivo da atividade pai
        if (at.efetivo && at.efetivo > 0) {
          mapa[equipeChave].efetivo += at.efetivo;
        }
        mapa[equipeChave].atividades.push({
          nome: at.nome, pavimento: nomePav,
          subNome: at.efetivo ? `${at.efetivo} func.` : undefined,
        });
      }
    });

    // Ordenar: equipes com efetivo primeiro, depois sem efetivo
    return Object.values(mapa).sort((a, b) => {
      if (b.efetivo !== a.efetivo) return b.efetivo - a.efetivo;
      return a.equipe.localeCompare(b.equipe);
    });
  }, [atividadesDoDia]);

  const totalEfetivo = efetivoDoDia.reduce((acc, e) => acc + e.efetivo, 0);

  // ─── Dados do Relatório por Período ───
  const periodoRelatorio = useMemo(() => {
    const d = parseDate(dataSelecionada);
    if (tipoRelatorio === 'dia') {
      return { inicio: dataSelecionada, fim: dataSelecionada, label: `Dia ${fmtDate(dataSelecionada)}` };
    } else if (tipoRelatorio === 'semana') {
      const dom = new Date(d); dom.setDate(d.getDate() - d.getDay());
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
      return { inicio: toStr(dom), fim: toStr(sab), label: `Semana de ${fmtDate(toStr(dom))} a ${fmtDate(toStr(sab))}` };
    } else {
      const ini = new Date(d.getFullYear(), d.getMonth(), 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { inicio: toStr(ini), fim: toStr(fim), label: `${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` };
    }
  }, [dataSelecionada, tipoRelatorio]);

  const atividadesRelatorio = useMemo(() =>
    atividadesEfetivas.filter(a => estaNoIntervalo(dataSelecionada, a.data_inicio, a.data_fim) ||
      (parseDate(a.data_inicio) <= parseDate(periodoRelatorio.fim) && parseDate(a.data_fim) >= parseDate(periodoRelatorio.inicio))
    ), [atividadesEfetivas, periodoRelatorio]);

  const dadosRelatorio = useMemo(() => {
    // Por equipe
    const equipes: Record<string, { efetivo: number; atividades: {nome: string; pavimento: string; inicio: string; fim: string; duracao: number; subNome?: string}[] }> = {};
    atividadesRelatorio.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento';
      const addEquipe = (eq: string, ef: number, subN?: string) => {
        if (!equipes[eq]) equipes[eq] = { efetivo: 0, atividades: [] };
        equipes[eq].efetivo = Math.max(equipes[eq].efetivo, ef);
        const jaExiste = equipes[eq].atividades.find(a => a.nome === at.nome && a.pavimento === nomePav);
        if (!jaExiste) equipes[eq].atividades.push({
          nome: at.nome, pavimento: nomePav,
          inicio: at.data_inicio, fim: at.data_fim,
          duracao: at.duracao_dias ?? 0, subNome: subN,
        });
      };
      if (at.subatividades?.length > 0) {
        at.subatividades.forEach(s => addEquipe(s.equipe?.trim() || at.equipe?.trim() || 'Sem equipe', s.efetivo || 0, s.nome));
      } else {
        addEquipe(at.equipe?.trim() || 'Sem equipe', at.efetivo || 0);
      }
    });

    // Por bloco
    const blocos: Record<string, Atividade[]> = {};
    atividadesRelatorio.forEach(at => {
      const bloco = at.pavimento?.nome?.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : at.pavimento?.nome || 'Sem bloco';
      if (!blocos[bloco]) blocos[bloco] = [];
      if (!blocos[bloco].find(a => a.id === at.id)) blocos[bloco].push(at);
    });

    const totalEf = Object.values(equipes).reduce((acc, e) => acc + e.efetivo, 0);
    return { equipes, blocos, totalEfetivo: totalEf, totalAtividades: atividadesRelatorio.length };
  }, [atividadesRelatorio]);

  // ─── Exportar Excel (CSV) ───
  const exportarCSV = () => {
    const linhas: string[][] = [
      ['RELATÓRIO DE OBRA', '', '', '', '', ''],
      [obra?.nome || '', '', '', '', '', ''],
      [periodoRelatorio.label, '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['RESUMO', '', '', '', '', ''],
      ['Total de Atividades', String(dadosRelatorio.totalAtividades), '', '', '', ''],
      ['Total de Equipes', String(Object.keys(dadosRelatorio.equipes).length), '', '', '', ''],
      ['Efetivo Previsto Total', String(dadosRelatorio.totalEfetivo) + ' func.', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['EQUIPES E EFETIVO', '', '', '', '', ''],
      ['Equipe', 'Efetivo (func.)', 'Qtd. Atividades', '', '', ''],
      ...Object.entries(dadosRelatorio.equipes).map(([eq, d]) => [eq, String(d.efetivo), String(d.atividades.length), '', '', '']),
      ['', '', '', '', '', ''],
      ['ATIVIDADES NO PERÍODO', '', '', '', '', ''],
      ['Atividade', 'Pavimento', 'Data Início', 'Data Fim', 'Duração (dias)', 'Equipe / Efetivo'],
      ...atividadesRelatorio.flatMap(at => {
        if (at.subatividades?.length > 0) {
          return at.subatividades.map(s => [
            at.nome + ' › ' + s.nome,
            at.pavimento?.nome || '',
            fmtDate(at.data_inicio),
            fmtDate(at.data_fim),
            String(s.duracao),
            `${s.equipe || at.equipe || ''} · ${s.efetivo || 0} func.`,
          ]);
        }
        return [[at.nome, at.pavimento?.nome || '', fmtDate(at.data_inicio), fmtDate(at.data_fim), String(at.duracao_dias || ''), `${at.equipe || ''} · ${at.efetivo || 0} func.`]];
      }),
    ];
    const csv = linhas.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${tipoRelatorio}_${dataSelecionada}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ─── Imprimir / PDF ───
  const imprimirRelatorio = () => {
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) { alert('Permita popups para imprimir'); return; }

    const blocoHtml = Object.entries(dadosRelatorio.blocos).map(([bloco, ativs]) => `
      <div style="margin-bottom:16px">
        <div style="background:#1e40af;color:white;padding:6px 12px;border-radius:4px 4px 0 0;font-weight:700;font-size:12px">🏢 ${bloco}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr style="background:#f1f5f9">
            <th style="padding:5px 8px;text-align:left;border:1px solid #e2e8f0">Atividade</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #e2e8f0">Pavimento</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #e2e8f0">Início</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #e2e8f0">Fim</th>
            <th style="padding:5px 8px;text-align:center;border:1px solid #e2e8f0">Dias</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #e2e8f0">Equipe</th>
            <th style="padding:5px 8px;text-align:center;border:1px solid #e2e8f0">Efetivo</th>
          </tr>
          ${ativs.flatMap(at => {
            if (at.subatividades?.length > 0) {
              return at.subatividades.map((s, i) => `
                <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                  <td style="padding:4px 8px;border:1px solid #e2e8f0;color:#475569">${i===0?`<strong>${at.nome}</strong><br/>`:''}<span style="color:#94a3b8;font-size:10px">└ ${s.nome}</span></td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0">${i===0?at.pavimento?.nome||'':''}</td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0">${i===0?fmtDate(at.data_inicio):''}</td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0">${i===0?fmtDate(at.data_fim):''}</td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center">${s.duracao}d</td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0">${s.equipe||at.equipe||'-'}</td>
                  <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${s.efetivo||0}</td>
                </tr>`);
            }
            return [`<tr>
              <td style="padding:4px 8px;border:1px solid #e2e8f0"><strong>${at.nome}</strong></td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${at.pavimento?.nome||''}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmtDate(at.data_inicio)}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmtDate(at.data_fim)}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center">${at.duracao_dias||''}d</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${at.equipe||'-'}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${at.efetivo||0}</td>
            </tr>`];
          }).join('')}
        </table>
      </div>`).join('');

    const equipeHtml = Object.entries(dadosRelatorio.equipes).map(([eq, d]) => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:600">${eq}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${d.efetivo}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0">${d.atividades.map(a => a.nome).join(', ')}</td>
      </tr>`).join('');

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Relatório — ${obra?.nome}</title>
      <style>
        body{margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b}
        h1{font-size:20px;font-weight:800;margin:0 0 2px;color:#0f172a}
        h2{font-size:14px;font-weight:700;margin:20px 0 8px;color:#1e40af;border-bottom:2px solid #bfdbfe;padding-bottom:4px}
        .meta{font-size:11px;color:#64748b;margin:0 0 16px}
        .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
        .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px}
        .card .val{font-size:28px;font-weight:800;color:#2563eb}
        .card .lab{font-size:11px;color:#64748b;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-bottom:4px}
        th{background:#f1f5f9;padding:5px 8px;text-align:left;border:1px solid #e2e8f0;font-size:11px;font-weight:700}
        @media print{body{padding:10px}@page{size:A4;margin:8mm}}
      </style>
    </head><body>
      <h1>📊 Relatório de Obra</h1>
      <p class="meta">${obra?.nome || ''} &nbsp;·&nbsp; ${modoVersao && versaoSelecionada ? `Versão: ${versaoSelecionada.nome}` : 'Ao Vivo'} &nbsp;·&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' })}</p>
      <p class="meta" style="font-size:14px;font-weight:700;color:#1e40af">${periodoRelatorio.label}</p>

      <div class="cards">
        <div class="card"><div class="val">${dadosRelatorio.totalAtividades}</div><div class="lab">Atividades no Período</div></div>
        <div class="card"><div class="val">${Object.keys(dadosRelatorio.equipes).length}</div><div class="lab">Equipes Ativas</div></div>
        <div class="card"><div class="val" style="color:#10b981">${dadosRelatorio.totalEfetivo}</div><div class="lab">Efetivo Total (func.)</div></div>
      </div>

      <h2>👷 Equipes e Efetivo</h2>
      <table>
        <tr><th>Equipe</th><th style="text-align:center;width:80px">Efetivo</th><th>Atividades</th></tr>
        ${equipeHtml}
      </table>

      <h2>🏗️ Atividades por Bloco</h2>
      ${blocoHtml}
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  // ─── Agrupar atividades por bloco ───
  const atividadesPorBloco = useMemo(() => {
    const grupos: Record<string, Atividade[]> = {};
    atividadesDoDia.forEach(at => {
      const bloco = at.pavimento?.nome.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : (at.pavimento?.nome || 'Sem bloco');
      if (!grupos[bloco]) grupos[bloco] = [];
      grupos[bloco].push(at);
    });
    return grupos;
  }, [atividadesDoDia]);

  // ─── Indicadores rápidos ───
  const totalAtividades = atividades.length;
  const atividadesEmAndamento = atividadesDoDia.length;
  const equipesAtivas = useMemo(() => {
    const set = new Set<string>();
    atividadesDoDia.forEach(at => {
      if (at.subatividades && at.subatividades.length > 0) {
        at.subatividades.forEach(s => {
          const eq = s.equipe?.trim() || at.equipe?.trim();
          if (eq) set.add(eq);
        });
      } else if (at.equipe?.trim()) {
        set.add(at.equipe.trim());
      }
    });
    return set.size;
  }, [atividadesDoDia]);

  const diasRestantes = useMemo(() => {
    if (!obra?.data_fim) return null;
    const fim = parseDate(obra.data_fim);
    const hoje2 = new Date();
    hoje2.setHours(0,0,0,0);
    const diff = Math.ceil((fim.getTime() - hoje2.getTime()) / 86400000);
    return diff;
  }, [obra]);

  const isHoje = dataSelecionada === hoje();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <p className="text-slate-500">Carregando dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push(`/obras/${obraId}`)}
                className="text-blue-600 hover:text-blue-700 font-semibold">
                ← Voltar
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">📊 Dashboard</h1>
                <p className="text-sm text-slate-500">{obra?.nome}</p>
              </div>
            </div>

            {/* Filtro de versão */}
              {versoes.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-slate-500 font-medium">📦 Versão:</span>
                  <select
                    value={versaoSelecionada?.id ?? 'ao-vivo'}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'ao-vivo') { setModoVersao(false); setVersaoSelecionada(null); }
                      else {
                        const v = versoes.find(v => String(v.id) === val);
                        if (v) { setVersaoSelecionada(v); setModoVersao(true); }
                      }
                    }}
                    className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer"
                  >
                    <option value="ao-vivo">🔴 Ao Vivo</option>
                    {versoes.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.status === 'Definitiva' ? '✅' : '🔄'} {v.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de data */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDataSelecionada(hoje())}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isHoje ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                📅 Hoje
              </button>
              <input
                type="date"
                value={dataSelecionada}
                onChange={e => setDataSelecionada(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 capitalize">{fmtDiaSemana(dataSelecionada)}</p>
                <p className="text-xs text-slate-500">{fmtDate(dataSelecionada)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ─── Cards de resumo ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Efetivo total */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">👷</div>
              <p className="text-sm text-slate-500 font-medium">Efetivo {isHoje ? 'Hoje' : 'no Dia'}</p>
            </div>
            <p className="text-4xl font-bold text-blue-600">{totalEfetivo}</p>
            <p className="text-xs text-slate-400 mt-1">funcionários previstos</p>
          </div>

          {/* Atividades em andamento */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">⚙️</div>
              <p className="text-sm text-slate-500 font-medium">Atividades</p>
            </div>
            <p className="text-4xl font-bold text-green-600">{atividadesEmAndamento}</p>
            <p className="text-xs text-slate-400 mt-1">em execução no dia</p>
          </div>

          {/* Equipes ativas */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">🦺</div>
              <p className="text-sm text-slate-500 font-medium">Equipes Ativas</p>
            </div>
            <p className="text-4xl font-bold text-orange-600">{equipesAtivas}</p>
            <p className="text-xs text-slate-400 mt-1">equipes no campo</p>
          </div>

          {/* Dias restantes */}
          <div className={`bg-white rounded-xl border shadow-sm p-5 ${
            diasRestantes !== null && diasRestantes < 0 ? 'border-red-200' :
            diasRestantes !== null && diasRestantes < 30 ? 'border-yellow-200' : 'border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                diasRestantes !== null && diasRestantes < 0 ? 'bg-red-100' :
                diasRestantes !== null && diasRestantes < 30 ? 'bg-yellow-100' : 'bg-purple-100'
              }`}>📆</div>
              <p className="text-sm text-slate-500 font-medium">Prazo da Obra</p>
            </div>
            {diasRestantes !== null ? (
              <>
                <p className={`text-4xl font-bold ${
                  diasRestantes < 0 ? 'text-red-600' : diasRestantes < 30 ? 'text-yellow-600' : 'text-purple-600'
                }`}>{Math.abs(diasRestantes)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {diasRestantes < 0 ? '⚠️ dias em atraso' : diasRestantes === 0 ? '🎯 termina hoje' : 'dias restantes'}
                </p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Sem prazo definido</p>
            )}
          </div>
        </div>

        {/* ─── Corpo principal ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ─── Efetivo por Equipe ─── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">👷 Efetivo por Equipe</h2>
              {totalEfetivo > 0 && (
                <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">
                  {totalEfetivo} total
                </span>
              )}
            </div>

            {efetivoDoDia.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <p className="text-4xl mb-3">😴</p>
                <p className="text-slate-500 font-medium">Nenhuma equipe prevista</p>
                <p className="text-slate-400 text-sm mt-1">
                  {isHoje ? 'Não há atividades programadas para hoje' : `Não há atividades em ${fmtDate(dataSelecionada)}`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {efetivoDoDia.map((item) => {
                  const cor = getCorEquipe(item.equipe);
                  const pct = totalEfetivo > 0 ? (item.efetivo / totalEfetivo) * 100 : 0;

                  return (
                    <div key={item.equipe} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cor }}></div>
                          <p className="font-bold text-slate-900">{item.equipe}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.efetivo > 0 && (
                            <span className="text-2xl font-bold" style={{ color: cor }}>{item.efetivo}</span>
                          )}
                          <span className="text-xs text-slate-400">
                            {item.efetivo > 0 ? 'func.' : 'sem efetivo'}
                          </span>
                        </div>
                      </div>

                      {/* Barra de proporção */}
                      {item.efetivo > 0 && (
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }}></div>
                        </div>
                      )}

                      {/* Atividades da equipe */}
                      <div className="space-y-1">
                        {item.atividades.map((at, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="text-slate-300 mt-0.5">•</span>
                            <span>
                              <span className="font-medium text-slate-700">{at.nome}</span>
                              {at.subNome && <span className="text-slate-500"> → {at.subNome}</span>}
                              <span className="text-slate-400"> · {at.pavimento}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Atividades do Dia ─── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">⚙️ Atividades do Dia</h2>
              {atividadesEmAndamento > 0 && (
                <span className="bg-green-100 text-green-700 text-sm font-bold px-3 py-1 rounded-full">
                  {atividadesEmAndamento} atividade{atividadesEmAndamento > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {atividadesDoDia.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-slate-500 font-medium">Nenhuma atividade prevista</p>
                <p className="text-slate-400 text-sm mt-1">
                  {isHoje ? 'Nada programado para hoje' : `Nada programado para ${fmtDate(dataSelecionada)}`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(atividadesPorBloco).map(([bloco, ativs]) => (
                  <div key={bloco} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Header do bloco */}
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                      <span>🏢</span>
                      <h3 className="font-bold text-slate-900 text-sm">{bloco}</h3>
                      <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                        {ativs.length} atividade{ativs.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Lista de atividades */}
                    <div className="divide-y divide-slate-100">
                      {ativs.map(at => {
                        const diasTotais = at.duracao_dias || 1;
                        const diasDecorridos = Math.floor((parseDate(dataSelecionada).getTime() - parseDate(at.data_inicio).getTime()) / 86400000) + 1;
                        const progresso = Math.min(100, Math.round((diasDecorridos / diasTotais) * 100));

                        return (
                          <div key={at.id} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-slate-900 text-sm">{at.nome}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {at.pavimento?.nome.includes(' - ')
                                    ? at.pavimento.nome.split(' - ')[1]
                                    : at.pavimento?.nome}
                                </p>
                              </div>
                              <div className="text-right ml-3">
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  {progresso}%
                                </span>
                              </div>
                            </div>

                            {/* Barra de progresso */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                              <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progresso}%` }}></div>
                            </div>

                            {/* Info */}
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>📅 {fmtDate(at.data_inicio)} → {fmtDate(at.data_fim)}</span>
                              <span>⏱️ {diasDecorridos}/{diasTotais}d</span>
                              {at.equipe && !at.subatividades.length && (
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(at.equipe) }}></span>
                                  {at.equipe}
                                </span>
                              )}
                            </div>

                            {/* Subatividades */}
                            {at.subatividades.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                {at.subatividades.map((sub, i) => (
                                  <div key={sub.id} className="flex items-center gap-2 bg-slate-50 rounded px-3 py-1.5 text-xs">
                                    <div className="w-2 h-2 rounded-sm flex-shrink-0"
                                      style={{ backgroundColor: CORES_EQUIPE[(i * 2) % CORES_EQUIPE.length] }}></div>
                                    <span className="font-medium text-slate-700">{sub.nome}</span>
                                    <span className="text-slate-400">{sub.duracao}d</span>
                                    {sub.equipe && (
                                      <span className="flex items-center gap-1 ml-auto">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorEquipe(sub.equipe) }}></span>
                                        {sub.equipe}
                                        {sub.efetivo && <span className="font-bold text-slate-600">· {sub.efetivo} func.</span>}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Navegação rápida ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={() => router.push(`/obras/${obraId}`)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
            <p className="text-2xl mb-2">🏗️</p>
            <p className="font-bold text-slate-900">Estrutura da Obra</p>
            <p className="text-sm text-slate-500 mt-1">Gerenciar pavimentos e blocos</p>
          </button>
          <button onClick={() => router.push(`/obras/${obraId}/linha-balanco`)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-green-300 hover:bg-green-50 transition-colors text-left">
            <p className="text-2xl mb-2">📊</p>
            <p className="font-bold text-slate-900">Linha de Balanço</p>
            <p className="text-sm text-slate-500 mt-1">Visualizar e programar atividades</p>
          </button>
          <button onClick={() => setModalRelatorio(true)}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left">
            <p className="text-2xl mb-2">📈</p>
            <p className="font-bold text-slate-900">Relatórios</p>
            <p className="text-sm text-slate-500 mt-1">Exportar por dia, semana ou mês</p>
          </button>
        </div>

      </main>

      {/* ─── Modal Relatórios ─── */}
      {modalRelatorio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">📈 Gerar Relatório</h3>
              <button onClick={() => setModalRelatorio(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            {/* Tipo de período */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Período</label>
              <div className="grid grid-cols-3 gap-2">
                {([['dia','📅 Dia','Atividades do dia'], ['semana','📆 Semana','Semana atual'], ['mes','🗓️ Mês','Mês inteiro']] as const).map(([tipo, label, desc]) => (
                  <button key={tipo} onClick={() => setTipoRelatorio(tipo)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${tipoRelatorio === tipo ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="font-semibold text-slate-900 text-sm">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Data de referência */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Data de Referência</label>
              <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 text-sm w-full" />
              <p className="text-xs text-slate-500 mt-1">📅 {periodoRelatorio.label}</p>
            </div>

            {/* Preview resumido */}
            <div className="bg-slate-50 rounded-lg p-4 mb-5 grid grid-cols-3 gap-3 text-center">
              <div><div className="text-2xl font-bold text-blue-600">{dadosRelatorio.totalAtividades}</div><div className="text-xs text-slate-500">Atividades</div></div>
              <div><div className="text-2xl font-bold text-green-600">{Object.keys(dadosRelatorio.equipes).length}</div><div className="text-xs text-slate-500">Equipes</div></div>
              <div><div className="text-2xl font-bold text-purple-600">{dadosRelatorio.totalEfetivo}</div><div className="text-xs text-slate-500">Efetivo</div></div>
            </div>

            {/* Versão usada */}
            {modoVersao && versaoSelecionada && (
              <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
                📦 Dados da versão: <strong>{versaoSelecionada.nome}</strong>
              </div>
            )}

            {/* Botões de exportação */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => { exportarCSV(); setModalRelatorio(false); }}
                className="flex flex-col items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-colors">
                <span className="text-2xl">📊</span>
                <span>Exportar Excel</span>
                <span className="text-xs opacity-80">Abre no Excel</span>
              </button>
              <button onClick={() => { imprimirRelatorio(); }}
                className="flex flex-col items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors">
                <span className="text-2xl">📄</span>
                <span>Exportar PDF</span>
                <span className="text-xs opacity-80">Salvar como PDF</span>
              </button>
              <button onClick={() => { imprimirRelatorio(); }}
                className="flex flex-col items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-sm transition-colors">
                <span className="text-2xl">🖨️</span>
                <span>Imprimir</span>
                <span className="text-xs opacity-80">Impressora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
