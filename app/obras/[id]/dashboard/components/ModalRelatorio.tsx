'use client'

import { useState, useMemo } from 'react'
import type { ApontamentoDiario } from '@/app/lib/types'
import { toStr, parseDate, fmtDate, type DashboardObra, type DashboardAtividade, type DashboardFeriado, type DashboardVersao } from '../utils'

interface Props {
  aberto: boolean
  onFechar: () => void
  obra: DashboardObra
  atividades: DashboardAtividade[]
  apontamentosHoje: ApontamentoDiario[]
  feriados: DashboardFeriado[]
  versaoSelecionada: DashboardVersao | null
  modoVersao: boolean
  dataSelecionada: string
  setDataSelecionada: (d: string) => void
}

export function ModalRelatorio({
  aberto, onFechar, obra, atividades, apontamentosHoje,
  versaoSelecionada, modoVersao, dataSelecionada, setDataSelecionada,
}: Props) {
  const [tipoRelatorio, setTipoRelatorio] = useState<'dia' | 'semana' | 'mes'>('dia')

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

  const atividadesRelatorio = useMemo(() =>
    atividades.filter(a =>
      parseDate(a.data_inicio) <= parseDate(periodoRelatorio.fim) &&
      parseDate(a.data_fim) >= parseDate(periodoRelatorio.inicio)
    ),
    [atividades, periodoRelatorio]
  )

  const dadosRelatorio = useMemo(() => {
    const mapa: Record<string, { equipe: string; efetivo: number; atividades: { nome: string; pavimento: string; inicio: string; fim: string; duracao: number; subNome?: string }[] }> = {}
    const garantirEquipe = (chave: string) => {
      if (!mapa[chave]) mapa[chave] = { equipe: chave, efetivo: 0, atividades: [] }
    }

    atividadesRelatorio.forEach(at => {
      const nomePav = at.pavimento?.nome || 'Sem pavimento'
      if (at.subatividades && at.subatividades.length > 0) {
        const subsPorEquipe: Record<string, { efetivo: number; nomes: string[] }> = {}
        at.subatividades.forEach(sub => {
          const equipeChave = sub.equipe?.trim() || at.equipe?.trim() || 'Sem equipe'
          if (!subsPorEquipe[equipeChave]) subsPorEquipe[equipeChave] = { efetivo: 0, nomes: [] }
          if (sub.efetivo && sub.efetivo > 0) subsPorEquipe[equipeChave].efetivo += sub.efetivo
          subsPorEquipe[equipeChave].nomes.push(sub.nome)
        })
        Object.entries(subsPorEquipe).forEach(([equipeChave, dados]) => {
          garantirEquipe(equipeChave)
          mapa[equipeChave].efetivo += dados.efetivo
          mapa[equipeChave].atividades.push({ nome: at.nome, pavimento: nomePav, inicio: at.data_inicio, fim: at.data_fim, duracao: at.duracao_dias ?? 0, subNome: dados.nomes.join(', ') })
        })
      } else {
        const equipeChave = at.equipe?.trim() || 'Sem equipe'
        garantirEquipe(equipeChave)
        if (at.efetivo && at.efetivo > 0) mapa[equipeChave].efetivo += at.efetivo
        mapa[equipeChave].atividades.push({ nome: at.nome, pavimento: nomePav, inicio: at.data_inicio, fim: at.data_fim, duracao: at.duracao_dias ?? 0 })
      }
    })

    const blocos: Record<string, DashboardAtividade[]> = {}
    atividadesRelatorio.forEach(at => {
      const bloco = at.pavimento?.nome?.includes(' - ')
        ? at.pavimento.nome.split(' - ')[0].trim()
        : at.pavimento?.nome || 'Sem bloco'
      if (!blocos[bloco]) blocos[bloco] = []
      if (!blocos[bloco].find(a => a.id === at.id)) blocos[bloco].push(at)
    })

    const totalEf = Object.values(mapa).reduce((acc, e) => acc + e.efetivo, 0)
    return { equipes: mapa, blocos, totalEfetivo: totalEf, totalAtividades: atividadesRelatorio.length }
  }, [atividadesRelatorio])

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
      ...atividadesRelatorio.flatMap(at => {
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

  if (!aberto) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">📈 Gerar Relatório</h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Período</label>
          <div className="grid grid-cols-3 gap-2">
            {([['dia', '📅 Dia', 'Atividades do dia'], ['semana', '📆 Semana', 'Semana atual'], ['mes', '🗓️ Mês', 'Mês inteiro']] as const).map(([tipo, label, desc]) => (
              <button key={tipo} onClick={() => setTipoRelatorio(tipo)}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${tipoRelatorio === tipo ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-semibold text-slate-900 text-sm">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Data de Referência</label>
          <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 text-sm w-full" />
          <p className="text-xs text-slate-500 mt-1">📅 {periodoRelatorio.label}</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-5 grid grid-cols-3 gap-3 text-center">
          <div><div className="text-2xl font-bold text-blue-600">{dadosRelatorio.totalAtividades}</div><div className="text-xs text-slate-500">Atividades</div></div>
          <div><div className="text-2xl font-bold text-green-600">{Object.keys(dadosRelatorio.equipes).length}</div><div className="text-xs text-slate-500">Equipes</div></div>
          <div><div className="text-2xl font-bold text-purple-600">{dadosRelatorio.totalEfetivo}</div><div className="text-xs text-slate-500">Efetivo</div></div>
        </div>

        {modoVersao && versaoSelecionada && (
          <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
            📦 Dados da versão: <strong>{versaoSelecionada.nome}</strong>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => { exportarCSV(); onFechar() }}
            className="flex flex-col items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-colors">
            <span className="text-2xl">📊</span>
            <span>Exportar Excel</span>
            <span className="text-xs opacity-80">Abre no Excel</span>
          </button>
          <button onClick={imprimirRelatorio}
            className="flex flex-col items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors">
            <span className="text-2xl">📄</span>
            <span>Exportar PDF</span>
            <span className="text-xs opacity-80">Salvar como PDF</span>
          </button>
          <button onClick={imprimirRelatorio}
            className="flex flex-col items-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-sm transition-colors">
            <span className="text-2xl">🖨️</span>
            <span>Imprimir</span>
            <span className="text-xs opacity-80">Impressora</span>
          </button>
        </div>
      </div>
    </div>
  )
}
