import type { ApontamentoDiario } from '@/app/lib/types'

// ── Tipos locais do módulo dashboard ──

export interface DashboardObra {
  id: number; nome: string;
  data_inicio: string | null; data_fim: string | null;
  sabado_util: boolean; domingo_util: boolean;
}

export interface DashboardFeriado { id: number; data: string; nome: string; }

export interface DashboardPavimento { id: number; obra_id: number; nome: string; numero: number | null; }

export interface DashboardSubatividade {
  id: number; atividade_id: number; nome: string;
  duracao: number; equipe: string | null; efetivo: number | null; ordem: number;
}

export interface DashboardAtividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  efetivo: number | null;
  linha_index: number; vinculo_id: string | null; vinculo_ordem: number | null;
  subatividades: DashboardSubatividade[];
  pavimento?: DashboardPavimento;
}

export interface DashboardVersao {
  id: number; obra_id: number; nome: string; descricao: string | null;
  status: 'Definitiva' | 'Em Atualização';
  snapshot: { pavimentos: unknown[] };
  created_at: string;
}

export interface ItemEfetivo {
  equipe: string;
  efetivo: number;
  atividades: { nome: string; pavimento: string; subNome?: string }[];
}

export interface AtividadeParalisada {
  id: number;
  nome: string;
  pavimentoNome: string;
  ultimoApontamento: ApontamentoDiario;
}

// ── Helpers de data e cores ──

export const CORES_EQUIPE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16']

const coresEquipe: Record<string, string> = {}
let ceIdx = 0
export const getCorEquipe = (equipe: string): string => {
  if (!coresEquipe[equipe]) coresEquipe[equipe] = CORES_EQUIPE[ceIdx++ % CORES_EQUIPE.length]
  return coresEquipe[equipe]
}

export const toStr = (d: Date): string => d.toISOString().split('T')[0]
export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const fmtDate = (s: string): string => parseDate(s).toLocaleDateString('pt-BR')
export const fmtDiaSemana = (s: string): string =>
  parseDate(s).toLocaleDateString('pt-BR', { weekday: 'long' })
export const hoje = (): string => toStr(new Date())
export const estaNoIntervalo = (data: string, inicio: string, fim: string): boolean => {
  const d = parseDate(data), i = parseDate(inicio), f = parseDate(fim)
  return d >= i && d <= f
}
