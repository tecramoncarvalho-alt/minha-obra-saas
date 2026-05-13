'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import LinhaBalancoTV, { type TVAtividade, type TVPavimento, type TVApontamento } from './LinhaBalancoTV'
import AtividadesEfetivo from './AtividadesEfetivo'
import EquipesPanel from './EquipesPanel'

export interface TVData {
  obra: { id: number; nome: string }
  pavimentos: TVPavimento[]
  atividades: TVAtividade[]
  apontamentos: TVApontamento[]
}

interface Props {
  data: TVData
  onRefresh?: () => void
  children?: React.ReactNode // slot para SharePanel (rota autenticada)
}

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

function getNumeroSemana(d: Date) {
  const inicio = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86400000 + inicio.getDay() + 1) / 7)
}

function Relogio() {
  const [hora, setHora] = useState('')
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono tabular-nums">{hora}</span>
}

export default function DashboardTV({ data, onRefresh, children }: Props) {
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cursorVisivel, setCursorVisivel] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const hoje = new Date()
  const dataExtenso = `${DIAS[hoje.getDay()]}, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`
  const semana = getNumeroSemana(hoje)

  // Cursor some após 5s de inatividade
  const reiniciarCursorTimer = useCallback(() => {
    setCursorVisivel(true)
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    cursorTimerRef.current = setTimeout(() => setCursorVisivel(false), 5000)
  }, [])

  useEffect(() => {
    reiniciarCursorTimer()
    return () => { if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current) }
  }, [reiniciarCursorTimer])

  // Auto-refresh a cada 30s
  useEffect(() => {
    if (!onRefresh) return
    const id = setInterval(onRefresh, 30_000)
    return () => clearInterval(id)
  }, [onRefresh])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => null)
    } else {
      document.exitFullscreen().catch(() => null)
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden select-none"
      style={{ cursor: cursorVisivel ? 'default' : 'none' }}
      onMouseMove={reiniciarCursorTimer}
      onTouchStart={reiniciarCursorTimer}
    >
      {/* ── Header fixo ── */}
      <header className="flex-shrink-0 grid grid-cols-3 items-center px-6 py-3 bg-gray-900 border-b border-gray-800 gap-4">
        <div className="font-bold text-lg text-white truncate">{data.obra.nome}</div>

        <div className="text-center">
          <div className="text-sm font-medium text-gray-200">{dataExtenso}</div>
          <div className="text-xs text-gray-500">Semana {semana}</div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            AO VIVO
          </span>
          <span className="text-sm text-gray-300">
            <Relogio />
          </span>
        </div>
      </header>

      {/* ── 3 Quadrantes ── */}
      <div className="flex-1 grid gap-px overflow-hidden" style={{ gridTemplateColumns: '45fr 30fr 25fr', background: '#1f2937' }}>
        {/* Q1 — Linha de Balanço semanal */}
        <div className="bg-gray-950 overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Linha de Balanço — Semana Atual
          </div>
          <div className="flex-1 overflow-hidden">
            <LinhaBalancoTV
              atividades={data.atividades}
              pavimentos={data.pavimentos}
              apontamentos={data.apontamentos}
            />
          </div>
        </div>

        {/* Q2 — Atividades + Efetivo */}
        <div className="bg-gray-950 overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Atividades · Efetivo
          </div>
          <div className="flex-1 overflow-hidden">
            <AtividadesEfetivo
              atividades={data.atividades}
              pavimentos={data.pavimentos}
              apontamentos={data.apontamentos}
            />
          </div>
        </div>

        {/* Q3 — Equipes */}
        <div className="bg-gray-950 overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Equipes
          </div>
          <div className="flex-1 overflow-hidden">
            <EquipesPanel
              atividades={data.atividades}
              pavimentos={data.pavimentos}
              apontamentos={data.apontamentos}
            />
          </div>

          {/* SharePanel abaixo das equipes (só na rota autenticada) */}
          {children && (
            <div className="flex-shrink-0 p-3 border-t border-gray-800">
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Botão fullscreen flutuante */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="fixed bottom-4 right-4 w-10 h-10 bg-gray-800/80 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-all flex items-center justify-center text-lg z-50"
        title="Alternar tela cheia"
      >
        ⛶
      </button>
    </div>
  )
}
