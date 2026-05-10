'use client'

import { useState, useMemo } from 'react'
import type { ApontamentoDiario } from '@/app/lib/types'
import {
  toStr, parseDate, fmtDate,
  type DashboardObra, type DashboardAtividade, type DashboardPavimento,
  type DashboardVersao,
} from '../utils'

interface Props {
  obra: DashboardObra
  atividades: DashboardAtividade[]
  pavimentos: DashboardPavimento[]
  versaoSelecionada: DashboardVersao | null
  modoVersao: boolean
  dataSelecionada: string
  setDataSelecionada: (d: string) => void
}

export function TabRelatorios({
  obra, atividades, pavimentos, versaoSelecionada, modoVersao,
  dataSelecionada, setDataSelecionada,
}: Props) {
  const [tipoRelatorio, setTipoRelatorio] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [pavimentoFiltro, setPavimentoFiltro] = useState<number | null>(null)
  const [equipeFiltro, setEquipeFiltro] = useState<string | null>(null)

  const equipesDisponiveis = useMemo((): string[] => {
    const set = new Set<string>()
    atividades.forEach(at => {
      if (at.equipe?.trim()) set.add(at.equipe.trim())
      at.subatividades?.forEach(s => { if (s.equipe?.trim()) set.add(s.equipe.trim()) })
    })
    return [...set].sort()
  }, [atividades])

  const periodoRelatorio = useMemo(() => {
    const d = parseDate(dataSelecionada)
    if (tipoRelatorio === 'dia') {
      return { inicio: dataSelecionada, fim: dataSelecionada, label: `Dia ${fmtDate(dataSelecionada)}` }
    } else if (tipoRelatorio === 'semana') {
      const dom = new Date(d); dom.setDate(d.getDate() - d.getDay())
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6)
      return { inicio: toStr(dom), fim: toStr(sab), label: `Semana de ${fmtDate(toStr(dom))} a ${fmtDate(toStr(sab))}` }
    } else {
      const ini = new Date(d.getFullYear(), d.getMonth(), 1)
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { inicio: toStr(ini), fim: toStr(fim), label: `${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` }
    }
  }, [dataSelecionada, tipoRelatorio])

  const atividadesFiltradas = useMemo(() => {
    let r = atividades
    if (pavimentoFiltro !== null) r = r.filter(a => a.pavimento_id === pavimentoFiltro)
    if (equipeFiltro !== null) r = r.filter(a =>
      a.equipe?.trim() === equipeFiltro ||
      a.subatividades?.some(s => s.equipe?.trim() === equipeFiltro)
    )
    return r.filter(a =>
      parseDate(a.data_inicio) <= parseDate(periodoRelatorio.fim) &&
      parseDate(a.data_fim)   >= parseDate(periodoRelatorio.inicio)
    )
  }, [atividades, periodoRelatorio, pavimentoFiltro, equipeFiltro])

  const dadosRelatorio = useMemo(() => {
    const mapa: Record<string, { equipe: string; efetivo: number; atividades: { nome: string; pavimento: string; inicio: string; fim: string; duracao: number; subNome?: string }[] }> = {}
    const garantirEquipe = (chave: string) => {
      if (!mapa[chave]) mapa[chave] = { equipe: chave, efetivo: 0, atividades: [] }
    }

    atividadesFiltradas.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento'
      if (at.subatividades && at.subatividades.length > 0) {
        const subsPorEquipe: Record<string, { efetivo: number; nomes: string[] }> = {}
        at.subatividades.forEach(sub => {
          const chave = sub.equipe?.trim() || at.equipe?.trim() || 'Sem equipe'
          if (!subsPorEquipe[chave]) subsPorEquipe[chave] = { efetivo: 0, nomes: [] }
          if (sub.efetivo && sub.efetivo > 0) subsPorEquipe[chave].efetivo += sub.efetivo
          subsPorEquipe[chave].nomes.push(sub.nome)
        })
        Object.entries(subsPorEquipe).forEach(([chave, dados]) => {
          garantirEquipe(chave)
          mapa[chave].efetivo += dados.efetivo
          mapa[chave].atividades.push({ nome: at.nome, pavimento: nomePav, inicio: at.data_inicio, fim: at.data_fim, duracao: at.duracao_dias ?? 0, subNome: dados.nomes.join(', ') })
        })
      } else {
        const chave = at.equipe?.trim() || 'Sem equipe'
        garantirEquipe(chave)
        if (at.efetivo && at.efetivo > 0) mapa[chave].efetivo += at.efetivo
        mapa[chave].atividades.push({ nome: at.nome, pavimento: nomePav, inicio: at.data_inicio, fim: at.data_fim, duracao: at.duracao_dias ?? 0 })
      }
    })

    const blocos: Record<string, DashboardAtividade[]> = {}
    atividadesFiltradas.forEach(at => {
      const bloco = at.pavimento?.nome?.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : at.pavimento?.nome || 'Sem bloco'
      if (!blocos[bloco]) blocos[bloco] = []
      if (!blocos[bloco].find(a => a.id === at.id)) blocos[bloco].push(at)
    })

    return {
      equipes: mapa, blocos,
      totalEfetivo: Object.values(mapa).reduce((acc, e) => acc + e.efetivo, 0),
      totalAtividades: atividadesFiltradas.length,
    }
  }, [atividadesFiltradas])

  const exportarCSV = () => {
    const linhas: string[][] = [
      ['RELATÓRIO DE OBRA', '', '', '', '', ''],
      [obra.nome || '', '', '', '', '', ''],
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
      ...atividadesFiltradas.flatMap(at => {
        if (at.subatividades?.length > 0) {
          return at.subatividades.map(s => [
            at.nome + ' › ' + s.nome, at.pavimento?.nome || '',
            fmtDate(at.data_inicio), fmtDate(at.data_fim), String(s.duracao),
            `${s.equipe || at.equipe || ''} · ${s.efetivo || 0} func.`,
          ])
        }
        return [[at.nome, at.pavimento?.nome || '', fmtDate(at.data_inicio), fmtDate(at.data_fim), String(at.duracao_dias || ''), `${at.equipe || ''} · ${at.efetivo || 0} func.`]]
      }),
    ]
    const csv = linhas.map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relatorio_${tipoRelatorio}_${dataSelecionada}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const imprimirRelatorio = () => {
    const win = window.open('', '_blank', 'width=1000,height=800')
    if (!win) { alert('Permita popups para imprimir'); return }

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
                </tr>`)
            }
            return [`<tr>
              <td style="padding:4px 8px;border:1px solid #e2e8f0"><strong>${at.nome}</strong></td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${at.pavimento?.nome||''}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmtDate(at.data_inicio)}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmtDate(at.data_fim)}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center">${at.duracao_dias||''}d</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0">${at.equipe||'-'}</td>
              <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${at.efetivo||0}</td>
            </tr>`]
          }).join('')}
        </table>
      </div>`).join('')

    const equipeHtml = Object.entries(dadosRelatorio.equipes).map(([eq, d]) => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:600">${eq}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${d.efetivo}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0">${d.atividades.map(a => a.nome).join(', ')}</td>
      </tr>`).join('')

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Relatório — ${obra.nome}</title>
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
      <p class="meta">${obra.nome || ''} &nbsp;·&nbsp; ${modoVersao && versaoSelecionada ? `Versão: ${versaoSelecionada.nome}` : 'Ao Vivo'} &nbsp;·&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' })}</p>
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
    </body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 600)
  }

  const temFiltroAtivo = pavimentoFiltro !== null || equipeFiltro !== null

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">📈 Relatórios</h2>

      {/* Período */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Período</label>
        <div className="grid grid-cols-3 gap-2 max-w-md">
          {([['dia', '📅 Dia', 'Atividades do dia'], ['semana', '📆 Semana', 'Semana atual'], ['mes', '🗓️ Mês', 'Mês inteiro']] as const).map(([tipo, label, desc]) => (
            <button key={tipo} type="button" onClick={() => setTipoRelatorio(tipo)}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${tipoRelatorio === tipo ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="font-semibold text-slate-900 text-sm">{label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Data de referência */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Data de Referência</label>
        <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
        <p className="text-xs text-slate-500 mt-1">📅 {periodoRelatorio.label}</p>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Pavimento</label>
          <select
            value={pavimentoFiltro ?? ''}
            onChange={e => setPavimentoFiltro(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="">Todos os pavimentos</option>
            {pavimentos.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Equipe</label>
          <select
            value={equipeFiltro ?? ''}
            onChange={e => setEquipeFiltro(e.target.value === '' ? null : e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="">Todas as equipes</option>
            {equipesDisponiveis.map(eq => (
              <option key={eq} value={eq}>{eq}</option>
            ))}
          </select>
        </div>
        {temFiltroAtivo && (
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => { setPavimentoFiltro(null); setEquipeFiltro(null) }}
              className="text-xs text-purple-600 underline hover:text-purple-800"
            >
              ✕ Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="bg-slate-50 rounded-xl p-5 grid grid-cols-3 gap-4 text-center border border-slate-200">
        <div>
          <div className="text-3xl font-bold text-blue-600">{dadosRelatorio.totalAtividades}</div>
          <div className="text-xs text-slate-500 mt-1">Atividades</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-green-600">{Object.keys(dadosRelatorio.equipes).length}</div>
          <div className="text-xs text-slate-500 mt-1">Equipes</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-purple-600">{dadosRelatorio.totalEfetivo}</div>
          <div className="text-xs text-slate-500 mt-1">Efetivo</div>
        </div>
      </div>

      {modoVersao && versaoSelecionada && (
        <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          📦 Dados da versão: <strong>{versaoSelecionada.nome}</strong>
        </div>
      )}

      {/* Exportação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button type="button" onClick={exportarCSV}
          className="flex items-center gap-3 px-5 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors">
          <span className="text-2xl">📊</span>
          <div className="text-left">
            <p>Exportar Excel</p>
            <p className="text-xs opacity-80 font-normal">Abre no Excel / Google Sheets</p>
          </div>
        </button>
        <button type="button" onClick={imprimirRelatorio}
          className="flex items-center gap-3 px-5 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors">
          <span className="text-2xl">📄</span>
          <div className="text-left">
            <p>Exportar PDF</p>
            <p className="text-xs opacity-80 font-normal">Salvar como PDF via impressão</p>
          </div>
        </button>
        <button type="button" onClick={imprimirRelatorio}
          className="flex items-center gap-3 px-5 py-4 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-colors">
          <span className="text-2xl">🖨️</span>
          <div className="text-left">
            <p>Imprimir</p>
            <p className="text-xs opacity-80 font-normal">Impressora física</p>
          </div>
        </button>
      </div>
    </div>
  )
}
