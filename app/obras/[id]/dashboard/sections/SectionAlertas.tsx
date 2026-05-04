'use client'

import { AlertasParalisadas } from '../components/AlertasParalisadas'
import type { AtividadeParalisada } from '../utils'

interface Props {
  paralisadas: AtividadeParalisada[]
}

export function SectionAlertas({ paralisadas }: Props) {
  return <AlertasParalisadas paralisadas={paralisadas} />
}
