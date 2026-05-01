export const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];

export const SUB_PALETTE = ['#1D4ED8','#047857','#B45309','#991B1B','#6D28D9','#BE185D','#0F766E','#C2410C','#4338CA','#4D7C0F',
  '#2563EB','#059669','#D97706','#DC2626','#7C3AED','#DB2777','#0D9488','#EA580C','#4F46E5','#65A30D'];

export const coresCache: Record<string, string> = {};
let palIdx = 0;

export const getCor = (nome: string): string => {
  if (!coresCache[nome]) coresCache[nome] = PALETTE[palIdx++ % PALETTE.length];
  return coresCache[nome];
};

export const getCorSub = (atividadeNome: string, subIndex: number): string => {
  const baseIdx = PALETTE.findIndex(c => c === coresCache[atividadeNome]);
  const offset = baseIdx >= 0 ? baseIdx * 2 : 0;
  return SUB_PALETTE[(offset + subIndex) % SUB_PALETTE.length];
};

export const calcDuracaoTotal = (subs: { duracao: number }[]): number =>
  subs.reduce((acc, s) => acc + (s.duracao || 0), 0);
