'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardTV, { type TVData } from '@/app/obras/[id]/dashboard-tv/components/DashboardTV'

interface Props {
  token: string
  obraNome: string
}

export default function TVClientWrapper({ token, obraNome }: Props) {
  const [data, setData] = useState<TVData | null>(null)
  const [erro, setErro] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tv/${token}`, { cache: 'no-store' })
      if (!res.ok) {
        setErro('Link inválido ou expirado.')
        return
      }
      const json = await res.json() as TVData
      setData(json)
    } catch {
      setErro('Erro de conexão. Tentando novamente em 30s…')
    }
  }, [token])

  useEffect(() => {
    fetchData()
    // Entrar em fullscreen automaticamente na primeira interação do usuário
    const handler = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => null)
      }
      document.removeEventListener('click', handler)
      document.removeEventListener('touchstart', handler)
    }
    document.addEventListener('click', handler, { once: true })
    document.addEventListener('touchstart', handler, { once: true })
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [fetchData])

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-400 gap-4">
        <div className="text-6xl">⚠️</div>
        <div className="text-lg text-gray-300">{erro}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400 text-lg">
        <span className="animate-pulse">Carregando dashboard…</span>
      </div>
    )
  }

  // Usar o nome da obra resolvido no servidor (mais confiável)
  const dataComNome: TVData = { ...data, obra: { ...data.obra, nome: obraNome } }

  return <DashboardTV data={dataComNome} onRefresh={fetchData} />
}
