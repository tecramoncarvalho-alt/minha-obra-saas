import { z } from 'zod'

const isoDate = (msg: string) =>
  z.string().refine(s => /^\d{4}-\d{2}-\d{2}$/.test(s), msg)

export const ApontamentoDiarioSchema = z.object({
  atividade_id: z.number().int().positive(),
  data: isoDate('Data inválida — use o formato AAAA-MM-DD'),
  efetivo_real: z.number().int().min(0, 'Efetivo real não pode ser negativo'),
  percentual_executado: z
    .number()
    .int()
    .min(0, 'Percentual mínimo é 0%')
    .max(100, 'Percentual máximo é 100%')
    .refine(val => val % 5 === 0, 'Percentual deve ser múltiplo de 5'),
  status: z.enum([
    'NAO_INICIADA',
    'INICIADA',
    'EM_ANDAMENTO',
    'CONCLUIDA_NO_DIA',
    'PARALISADA',
  ]),
  observacao: z.string().max(1000, 'Observação muito longa — máximo 1000 caracteres').optional(),
  responsavel: z.string().max(200, 'Nome muito longo — máximo 200 caracteres').optional(),
})

export type ApontamentoDiarioInput = z.infer<typeof ApontamentoDiarioSchema>

// Apenas campos mutáveis via PUT — atividade_id e data são imutáveis após criação
export const ApontamentoDiarioUpdateSchema = z.object({
  efetivo_real: z.number().int().min(0, 'Efetivo real não pode ser negativo').optional(),
  percentual_executado: z
    .number()
    .int()
    .min(0, 'Percentual mínimo é 0%')
    .max(100, 'Percentual máximo é 100%')
    .refine(val => val % 5 === 0, 'Percentual deve ser múltiplo de 5')
    .optional(),
  status: z
    .enum(['NAO_INICIADA', 'INICIADA', 'EM_ANDAMENTO', 'CONCLUIDA_NO_DIA', 'PARALISADA'])
    .optional(),
  observacao: z.string().max(1000, 'Observação muito longa — máximo 1000 caracteres').optional(),
  responsavel: z.string().max(200, 'Nome muito longo — máximo 200 caracteres').optional(),
}).refine(
  obj => Object.values(obj).some(v => v !== undefined),
  'Informe ao menos um campo para atualizar',
)

export type ApontamentoDiarioUpdateInput = z.infer<typeof ApontamentoDiarioUpdateSchema>

// Apenas para uso no cliente — z.instanceof(File) não funciona em Node.js
export function getMedicaoClienteSchema() {
  return z.object({
    atividade_id: z.number().int().positive(),
    data_medicao: isoDate('Data de medição inválida'),
    arquivo: z
      .instanceof(File)
      .refine(f => f.size < 10 * 1024 * 1024, 'Arquivo deve ter menos de 10MB antes de comprimir')
      .refine(
        f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
        'Formato inválido — use JPEG, PNG ou WebP',
      ),
  })
}
