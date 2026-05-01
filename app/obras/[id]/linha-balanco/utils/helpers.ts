export const fmtDate = (s: string): string => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
};

export const gerarUUID = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
