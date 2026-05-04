'use client'

import dynamic from 'next/dynamic'
import type { CurvaSPoint } from '@/app/lib/types'

const CurvaS = dynamic(
  () => import('../components/CurvaS').then(m => m.CurvaS),
  { loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />, ssr: false }
)

interface Props {
  dados: CurvaSPoint[]
}

export function SectionCurvaS({ dados }: Props) {
  if (dados.length < 2) return null
  return <CurvaS dados={dados} />
}
