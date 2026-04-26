// ─── lib/calendario.ts ───
// Fonte de verdade para cálculos de datas úteis em todo o sistema

export interface ConfigCalendario {
  sabadoUtil: boolean;
  domingoUtil: boolean;
  feriados: string[]; // formato 'YYYY-MM-DD'
}

// Parsear data sem timezone
export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addDias = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const diffDias = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86400000);

// Verificar se uma data é dia útil
export const isDiaUtil = (data: Date, config: ConfigCalendario): boolean => {
  const diaSemana = data.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
  const dataStr = toStr(data);

  // Verificar feriado
  if (config.feriados.includes(dataStr)) return false;

  // Sábado
  if (diaSemana === 6 && !config.sabadoUtil) return false;

  // Domingo
  if (diaSemana === 0 && !config.domingoUtil) return false;

  return true;
};

// Contar dias úteis entre duas datas (inclusive)
export const contarDiasUteis = (inicio: Date, fim: Date, config: ConfigCalendario): number => {
  let count = 0;
  const atual = new Date(inicio);
  while (atual <= fim) {
    if (isDiaUtil(atual, config)) count++;
    atual.setDate(atual.getDate() + 1);
  }
  return count;
};

// Adicionar N dias úteis a uma data
export const addDiasUteis = (data: Date, dias: number, config: ConfigCalendario): Date => {
  const resultado = new Date(data);
  let restante = Math.abs(dias);
  const direcao = dias >= 0 ? 1 : -1;

  while (restante > 0) {
    resultado.setDate(resultado.getDate() + direcao);
    if (isDiaUtil(resultado, config)) restante--;
  }

  return resultado;
};

// Calcular data de fim dado início e duração em dias úteis
export const calcularDataFim = (inicio: Date, duracaoDiasUteis: number, config: ConfigCalendario): Date => {
  if (duracaoDiasUteis <= 1) return new Date(inicio);
  return addDiasUteis(inicio, duracaoDiasUteis - 1, config);
};

// Calcular duração em dias úteis entre duas datas
export const calcularDuracaoUtil = (inicio: Date, fim: Date, config: ConfigCalendario): number => {
  return contarDiasUteis(inicio, fim, config);
};

// Labels dos dias da semana
export const LABEL_DIA: Record<number, string> = {
  0: 'D', 1: 'S', 2: 'T', 3: 'Q', 4: 'Q', 5: 'S', 6: 'S',
};

// Cor de fundo da coluna por dia da semana
export const corColunaDia = (data: Date, config: ConfigCalendario): string | undefined => {
  const dia = data.getDay();
  const dataStr = toStr(data);
  if (config.feriados.includes(dataStr)) return 'rgba(239,68,68,0.08)'; // feriado — vermelho claro
  if (dia === 0) return 'rgba(99,102,241,0.10)'; // domingo
  if (dia === 6) return 'rgba(99,102,241,0.05)'; // sábado
  return undefined;
};

// Gerar array de datas entre início e fim
export const gerarRangeDatas = (inicio: Date, fim: Date): Date[] => {
  const datas: Date[] = [];
  const atual = new Date(inicio);
  while (atual <= fim) {
    datas.push(new Date(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
};