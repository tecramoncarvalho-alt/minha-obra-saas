export interface Obra {
  id: number; nome: string;
  sabado_util: boolean; domingo_util: boolean;
  data_inicio: string | null; data_fim: string | null;
}

export interface Feriado { id: number; obra_id: number; data: string; nome: string; }

export interface Pavimento {
  id: number; obra_id: number; nome: string;
  numero: number | null; observacao: string | null;
}

export interface Subatividade {
  id: number;
  atividade_id: number;
  nome: string;
  duracao: number;
  equipe: string | null;
  efetivo: number | null;
  ordem: number;
  cor?: string;
}

export interface Atividade {
  id: number; pavimento_id: number; nome: string;
  data_inicio: string; data_fim: string;
  duracao_dias: number | null; equipe: string | null;
  efetivo: number | null;
  linha_index: number;
  vinculo_id: string | null;
  vinculo_ordem: number | null;
  subatividades?: Subatividade[];
}

export interface PavComAtiv extends Pavimento {
  atividades: Atividade[];
  numLinhas: number;
  blocoNome: string;
}

export interface SnapshotPavimento {
  id: number;
  nome: string;
  numero?: number | null;
  numLinhas?: number;
  atividades?: (Omit<Atividade, 'pavimento_id'> & {
    subatividades?: Omit<Subatividade, 'atividade_id'>[];
  })[];
}

export interface Versao {
  id: number; obra_id: number; nome: string;
  descricao: string | null; status: 'Definitiva' | 'Em Atualização';
  snapshot: { pavimentos?: SnapshotPavimento[] } | null;
  created_at: string;
}
