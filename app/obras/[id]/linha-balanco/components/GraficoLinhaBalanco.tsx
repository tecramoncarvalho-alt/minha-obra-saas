'use client';

import { useRef } from 'react';
import { parseDate, toStr, diffDias } from '@/app/calendario';
import type { Atividade, PavComAtiv, StatusAtividade } from '@/app/lib/types';
import { getCor, getCorSub, calcDuracaoTotal } from '../utils/geradorCores';

const LABEL_DIA = ['D','S','T','Q','Q','S','S'];
const LARGURA_NOME = 172;
const ALTURA_LINHA = 44;

const corColunaDia = (data: Date, feriadosSet: Set<string>, sabUtil: boolean, domUtil: boolean): string | undefined => {
  const dia = data.getDay();
  const s = toStr(data);
  if (feriadosSet.has(s)) return 'rgba(239,68,68,0.12)';
  if (dia === 0) return domUtil ? undefined : 'rgba(99,102,241,0.12)';
  if (dia === 6) return sabUtil ? undefined : 'rgba(99,102,241,0.06)';
  return undefined;
};

interface DragState {
  at: Atividade;
  deltaDias: number;
  deltaLinha: number;
}

interface ConflitosState {
  set: Set<number>;
  motivoConflito: Record<number, string>;
}

interface LinhaVinculo {
  x1: number; y1: number; x2: number; y2: number;
}

interface LinhaDependencia {
  x1: number; y1: number; x2: number; y2: number; lag: number;
}

interface Props {
  pavimentosFiltrados: PavComAtiv[];
  diasCalendario: Date[];
  dataMin: Date;
  totalDias: number;
  pxPorDia: number;
  feriadosSet: Set<string>;
  sabadoUtil: boolean;
  domingoUtil: boolean;
  modoInterativo?: boolean;
  // Usado apenas no modo interativo
  drag?: DragState | null;
  conflitos?: ConflitosState;
  hoverVinculo?: string | null;
  linhasVinculo?: LinhaVinculo[];
  linhasDependencias?: LinhaDependencia[];
  graficoRef?: React.RefObject<HTMLDivElement | null>;
  modoLeitura?: boolean;
  atualizando?: boolean;
  onContextMenu?: (e: React.MouseEvent, pav: PavComAtiv, diaClicado: number, linhaClicada: number) => void;
  onContextMenuAt?: (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => void;
  onMouseDown?: (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => void;
  onMouseEnterAt?: (e: React.MouseEvent, at: Atividade, pav: PavComAtiv) => void;
  onMouseLeaveAt?: () => void;
  onEditarBloco?: (blocoNome: string, linhasAtuais: number) => void;
  stickyHeader?: boolean;
  mostrarAvancoReal?: boolean;
  progrealPorAtividade?: Record<number, { percentual: number; status: StatusAtividade }>;
}

export function GraficoLinhaBalanco({
  pavimentosFiltrados, diasCalendario, dataMin, totalDias, pxPorDia,
  feriadosSet, sabadoUtil, domingoUtil,
  modoInterativo = false,
  drag, conflitos, hoverVinculo, linhasVinculo, linhasDependencias, graficoRef: graficoRefProp,
  modoLeitura, atualizando,
  onContextMenu, onContextMenuAt, onMouseDown, onMouseEnterAt, onMouseLeaveAt,
  onEditarBloco, stickyHeader = false,
  mostrarAvancoReal = false, progrealPorAtividade,
}: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const graficoRef = graficoRefProp ?? internalRef;

  const larguraTotal = LARGURA_NOME + totalDias * pxPorDia;

  return (
    <div
      ref={graficoRef}
      style={{ width: `${Math.max(larguraTotal, 900)}px`, position: 'relative', minHeight: '100%' }}
    >
      {/* SVG overlay para linhas de vínculo — apenas modo interativo */}
      {modoInterativo && hoverVinculo && linhasVinculo && linhasVinculo.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none z-30"
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <defs>
            <marker id="arrowVinculo" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(139,92,246,0.8)" />
            </marker>
          </defs>
          {linhasVinculo.map((l, i) => {
            const totalW = larguraTotal;
            const areaW = totalW - LARGURA_NOME;
            const x1 = LARGURA_NOME + Math.max(0, Math.min(1, l.x1)) * areaW;
            const x2 = LARGURA_NOME + Math.max(0, Math.min(1, l.x2)) * areaW;
            const y1 = l.y1;
            const y2 = l.y2;
            if (x1 <= LARGURA_NOME && x2 <= LARGURA_NOME) return null;
            if (x1 >= totalW && x2 >= totalW) return null;
            const mx = (x1 + x2) / 2;
            return (
              <g key={i}>
                <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="8" strokeLinecap="round" />
                <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke="rgba(139,92,246,0.75)" strokeWidth="2"
                  strokeDasharray="8 5" strokeLinecap="round" markerEnd="url(#arrowVinculo)" />
                <circle cx={x1} cy={y1} r={4} fill="rgba(139,92,246,0.9)" />
                <circle cx={x2} cy={y2} r={4} fill="rgba(139,92,246,0.9)" />
              </g>
            );
          })}
        </svg>
      )}

      {/* SVG overlay para linhas de dependência cruzada (âmbar tracejado) */}
      {modoInterativo && linhasDependencias && linhasDependencias.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none z-30"
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <defs>
            <marker id="arrowDep" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(245,158,11,0.9)" />
            </marker>
          </defs>
          {linhasDependencias.map((l, i) => {
            const totalW = larguraTotal;
            const areaW = totalW - LARGURA_NOME;
            const x1 = LARGURA_NOME + Math.max(0, Math.min(1, l.x1)) * areaW;
            const x2 = LARGURA_NOME + Math.max(0, Math.min(1, l.x2)) * areaW;
            const y1 = l.y1;
            const y2 = l.y2;
            if (x1 <= LARGURA_NOME && x2 <= LARGURA_NOME) return null;
            if (x1 >= totalW && x2 >= totalW) return null;
            const mx = (x1 + x2) / 2;
            return (
              <g key={`dep-${i}`}>
                <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="8" strokeLinecap="round" />
                <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke="rgba(245,158,11,0.85)" strokeWidth="2"
                  strokeDasharray="6 3" strokeLinecap="round" markerEnd="url(#arrowDep)" />
                <circle cx={x1} cy={y1} r={4} fill="rgba(245,158,11,0.9)" />
                <circle cx={x2} cy={y2} r={4} fill="rgba(245,158,11,0.9)" />
              </g>
            );
          })}
        </svg>
      )}

      {/* Linha vertical do dia atual — apenas modo interativo */}
      {modoInterativo && (() => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const diffHoje = diffDias(dataMin, hoje);
        if (diffHoje < 0 || diffHoje > totalDias) return null;
        const leftPx = LARGURA_NOME + diffHoje * pxPorDia;
        return (
          <div className="absolute top-0 bottom-0 pointer-events-none z-20"
            style={{ left: leftPx, width: 2, background: 'rgba(239,68,68,0.75)' }}>
            <div className="absolute bg-red-500 text-white rounded whitespace-nowrap"
              style={{ fontSize: 10, fontWeight: 700, padding: '2px 4px', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
              Hoje
            </div>
          </div>
        );
      })()}

      {/* Eixo X — cabeçalho com dias */}
      <div className={`flex border-b border-slate-200 bg-slate-50${stickyHeader ? ' sticky top-0 z-10' : ''}`} style={{ height: 44 }}>
        <div style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
          className={`border-r border-slate-200 px-3 flex items-center${stickyHeader ? ' bg-slate-50' : ''}`}>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pavimento</span>
        </div>
        <div className="flex-1 relative overflow-hidden">
          {diasCalendario.map((dia, i) => {
            const pct = (i / totalDias) * 100;
            const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
            const isDom = dia.getDay() === 0;
            const isSab = dia.getDay() === 6;
            const isFeriado = feriadosSet.has(toStr(dia));
            const larguraPct = (1 / totalDias) * 100;
            if (!stickyHeader && totalDias > 60 && i % 7 !== 0) return null;
            return (
              <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                style={{ left: `${pct}%`, width: `${larguraPct}%`, backgroundColor: bgCor, borderLeft: '1px solid rgba(0,0,0,0.04)' }}>
                {(stickyHeader || totalDias <= 60) && (
                  <>
                    <span className={`text-xs font-bold leading-none ${isFeriado ? 'text-red-500' : isDom ? 'text-indigo-600' : isSab ? 'text-indigo-400' : 'text-slate-500'}`}>
                      {LABEL_DIA[dia.getDay()]}
                    </span>
                    <span className="text-xs text-slate-400 leading-none mt-0.5">{dia.getDate()}</span>
                  </>
                )}
                {!stickyHeader && totalDias > 60 && i % 7 === 0 && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pavimentos */}
      {pavimentosFiltrados.map((pav, pavIdx) => {
        const alturaTotal = pav.numLinhas * ALTURA_LINHA;
        return (
          <div key={pav.id} className={`flex border-b border-slate-100 ${pavIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
            style={{ height: alturaTotal }}>
            {/* Nome do pavimento */}
            <div
              style={{ width: LARGURA_NOME, minWidth: LARGURA_NOME }}
              className={`border-r border-slate-200 px-3 flex flex-col justify-center${modoInterativo && onEditarBloco ? ' relative group cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
              onClick={() => {
                if (!modoInterativo || !onEditarBloco) return;
                if (modoLeitura) return;
                onEditarBloco(pav.blocoNome, pav.numLinhas);
              }}
            >
              <p className="text-xs font-semibold text-slate-800 truncate">{pav.nome}</p>
              {pav.numero !== null && <p className="text-xs text-slate-400">Nº {pav.numero}</p>}
              {modoInterativo && pav.numLinhas > 1 && <p className="text-xs text-blue-400">{pav.numLinhas} linhas</p>}
              {modoInterativo && onEditarBloco && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-bold text-blue-700 bg-white px-2 py-1 rounded shadow">✏️ Linhas</span>
                </div>
              )}
            </div>

            {/* Área de atividades */}
            <div
              className="flex-1 relative"
              onContextMenu={modoInterativo && onContextMenu ? e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xRel = e.clientX - rect.left;
                const yRel = e.clientY - rect.top;
                const diaClicado = Math.floor((xRel / rect.width) * totalDias);
                const linhaClicada = Math.floor(yRel / ALTURA_LINHA);
                onContextMenu(e, pav, diaClicado, linhaClicada);
              } : undefined}
            >
              {/* Grade vertical diária */}
              {diasCalendario.map((dia, i) => {
                const bgCor = corColunaDia(dia, feriadosSet, sabadoUtil, domingoUtil);
                return (
                  <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: `${(i / totalDias) * 100}%`,
                      width: `${(1 / totalDias) * 100}%`,
                      backgroundColor: bgCor || 'transparent',
                      borderLeft: '1px solid rgba(0,0,0,0.04)',
                    }} />
                );
              })}

              {/* Linhas separadoras de linhas */}
              {Array.from({ length: pav.numLinhas - 1 }, (_, i) => (
                <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                  style={{ top: (i + 1) * ALTURA_LINHA }} />
              ))}

              {/* Atividades */}
              {pav.atividades.map(at => {
                const isDragging = modoInterativo && drag?.at.id === at.id;
                const dispDia = diffDias(dataMin, parseDate(at.data_inicio)) + (isDragging ? drag!.deltaDias : 0);
                const dur = diffDias(parseDate(at.data_inicio), parseDate(at.data_fim)) + 1;
                const linhaAt = isDragging
                  ? Math.max(0, Math.min(pav.numLinhas - 1, at.linha_index + drag!.deltaLinha))
                  : (at.linha_index ?? 0);
                const cor = getCor(at.nome);
                const temConflito = modoInterativo && (conflitos?.set.has(at.id) ?? false);
                const temVinculo = !!at.vinculo_id;
                const temSubs = (at.subatividades?.length ?? 0) > 0;

                const leftPct = Math.max(0, (dispDia / totalDias) * 100);
                const rightPct = Math.min(100, ((dispDia + dur) / totalDias) * 100);
                const widthPct = Math.max(0, rightPct - leftPct);
                if (widthPct <= 0) return null;

                return (
                  <div
                    key={at.id}
                    className={`absolute rounded overflow-hidden select-none z-10 ${
                      modoInterativo
                        ? `${isDragging ? 'opacity-60 cursor-grabbing z-20' : 'cursor-grab hover:opacity-90'} ${atualizando ? 'pointer-events-none' : ''}`
                        : ''
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: linhaAt * ALTURA_LINHA + 4,
                      height: ALTURA_LINHA - 8,
                      minWidth: 4,
                      border: modoInterativo
                        ? (isDragging ? '2px dashed #3B82F6' : temConflito ? '2px solid #EF4444' : temVinculo ? '2px solid rgba(255,255,255,0.5)' : 'none')
                        : 'none',
                      backgroundColor: cor,
                    }}
                    onMouseDown={modoInterativo && onMouseDown ? e => onMouseDown(e, at, pav) : undefined}
                    onContextMenu={modoInterativo && onContextMenuAt ? e => onContextMenuAt(e, at, pav) : undefined}
                    onMouseEnter={modoInterativo && onMouseEnterAt ? e => onMouseEnterAt(e, at, pav) : undefined}
                    onMouseLeave={modoInterativo && onMouseLeaveAt ? () => onMouseLeaveAt() : undefined}
                  >
                    {/* Progresso real — sobreposição quando toggle ativo */}
                    {mostrarAvancoReal && (() => {
                      const prog = progrealPorAtividade?.[at.id];
                      if (!prog) return null;
                      const splitPct = Math.min(100, Math.max(0, prog.percentual));
                      const isParalisada = prog.status === 'PARALISADA';
                      return (
                        <>
                          <div
                            className="absolute top-0 bottom-0 left-0 pointer-events-none"
                            style={{ width: `${splitPct}%`, backgroundColor: 'rgba(255,255,255,0.35)' }}
                          />
                          {isParalisada && splitPct < 100 && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none"
                              style={{
                                left: `${splitPct}%`,
                                width: `${100 - splitPct}%`,
                                backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 3px, transparent 3px, transparent 8px)',
                              }}
                            />
                          )}
                        </>
                      );
                    })()}

                    {/* Segmentos de subatividades */}
                    {temSubs && !isDragging && (
                      <div className="absolute inset-x-0 bottom-0 flex" style={{ height: '40%' }}>
                        {(() => {
                          const duracaoTotal = calcDuracaoTotal(at.subatividades!);
                          return at.subatividades!.map((s, i) => (
                            <div key={s.id} className="h-full"
                              style={{
                                width: `${(s.duracao / duracaoTotal) * 100}%`,
                                backgroundColor: s.cor || getCorSub(at.nome, i),
                                borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.4)' : 'none',
                              }}
                              title={`${s.nome}: ${s.duracao}d${s.equipe ? ` | ${s.equipe}` : ''}${s.efetivo ? ` | ${s.efetivo} func.` : ''}`}
                            />
                          ));
                        })()}
                      </div>
                    )}

                    {/* Label */}
                    <div className={`absolute inset-x-0 top-0 flex items-center px-2 ${temSubs && !isDragging ? 'bottom-[40%]' : 'bottom-0'}`}>
                      <span className="text-white text-xs font-semibold truncate drop-shadow leading-none flex-1">
                        {at.nome}
                      </span>
                      {modoInterativo && temVinculo && <span className="text-white/80 text-xs ml-1 flex-shrink-0">🔗</span>}
                      {modoInterativo && temConflito && <span className="text-xs ml-1 flex-shrink-0">⚠️</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Área vazia se sem pavimentos */}
      {pavimentosFiltrados.length === 0 && (
        <div className="p-16 text-center text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p>Nenhum pavimento cadastrado</p>
        </div>
      )}
    </div>
  );
}
