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
  vinculo_lag?: number | null;   // dias úteis de intervalo antes de iniciar; negativo = overlap
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
// Adicione esses tipos ao seu types.ts existente

// ============================================
// APONTAMENTOS REAIS
// ============================================

export type StatusAtividade =
  | 'NAO_INICIADA'
  | 'INICIADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA_NO_DIA'
  | 'PARALISADA'

export interface ApontamentoDiario {
  id: string;
  atividade_id: number;
  data: string; // YYYY-MM-DD
  efetivo_real: number;
  percentual_executado: number; // 0-100
  status?: StatusAtividade;
  observacao?: string;
  responsavel?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CurvaSPoint {
  data: string;       // 'YYYY-MM-DD'
  diasUteis: number;  // posição no eixo X (apenas dias úteis)
  previsto: number;   // % acumulado previsto
  real: number;       // % acumulado real
}

export interface Medicao {
  id: string;
  atividade_id: number;
  apontamento_id?: string;
  data_medicao: string; // YYYY-MM-DD
  quantidade_executada?: number;
  unidade?: string;
  responsavel?: string;
  foto_url?: string;
  observacao?: string;
  created_by?: string;
  created_at: string;
}

export interface TokenApontamento {
  id: string;
  obra_id: number;
  token: string;
  nome_responsavel?: string;
  pin: string;
  ativo: boolean;
  created_by?: string;
  created_at: string;
  expires_at?: string;
}

export interface LogUpload {
  id: string;
  obra_id?: number;
  arquivo_nome: string;
  arquivo_tamanho: number; // em bytes
  bucket: string;
  status: 'sucesso' | 'falha';
  erro_mensagem?: string;
  user_id?: string;
  created_at: string;
}

export interface StorageQuota {
  id: string;
  empresa_id: string;
  storage_usado_bytes: number;
  storage_limite_bytes: number;
  plano: 'free' | 'pro' | 'empresa';
  percentual_usado: number;
  created_at: string;
  updated_at: string;
}

export interface ApontamentoComMedicoes extends ApontamentoDiario {
  medicoes: Medicao[];
  avancoPercentualAcumulado?: number;
}

// Para cálculos de avanço
export interface DesvioAtividade {
  atividade_id: number;
  nome_atividade: string;
  percentual_previsto: number;
  percentual_real: number;
  desvio_percentual: number;
  dias_atraso: number;
  status: 'no_prazo' | 'atrasado' | 'adiantado';
  status_apontamento?: StatusAtividade;
}

export interface DeltaEfetivo {
  previsto: number;
  real: number;
  delta: number;
  critico: boolean; // real < previsto * 0.7
}

export interface ResumoAvancoObra {
  percentual_conclusao_geral: number;
  avanço_previsto: number;
  avanço_real: number;
  dias_atraso_geral: number;
  efetivo_previsto_total: number;
  efetivo_real_total: number;
  aderencia_efetivo: number; // percentual
  atividades_atrasadas: DesvioAtividade[];
  data_calculo: string;
}

export interface Dependencia {
  id: string;
  predecessora_id: number;
  sucessora_id: number;
  lag_dias: number;
}

// ============================================
// MULTI-TENANT / RBAC
// ============================================

export type Role = 'admin' | 'planejador' | 'operator' | 'viewer'

export interface Plano {
  id: string
  nome: string
  max_users: number
  max_projects: number
  storage_limit: number
  features_enabled: string[]
  ativo: boolean
}

export interface EmpresaDetalhada {
  id: string
  nome: string
  codigo_empresa: string | null
  cnpj: string | null
  endereco: string | null
  foto_logo_url: string | null
  email_cadastro: string | null
  email_recuperacao: string | null
  subscription_status: 'Active' | 'Trial' | 'Past_Due' | null
  expires_at: string | null
  plano: Plano | null
}

export interface JoinRequest {
  id: string
  user_id: string
  empresa_id: string
  status: 'pending' | 'approved' | 'rejected'
  role: 'planejador' | 'operator' | 'viewer'
  created_at: string
  updated_at: string
}