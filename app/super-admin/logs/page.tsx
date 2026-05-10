'use client'

import { useState, useEffect } from 'react'

interface Log {
  id: string
  actor_id: string
  target_type: string
  target_id: string
  action: string
  details: Record<string, unknown>
  created_at: string
  empresas: { nome: string } | null
  actor_email: string | null
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-900 text-green-400',
  update: 'bg-blue-900 text-blue-400',
  delete: 'bg-red-900 text-red-400',
  role_change: 'bg-purple-900 text-purple-400',
  member_added: 'bg-emerald-900 text-emerald-400',
  member_removed: 'bg-orange-900 text-orange-400',
  plan_change: 'bg-yellow-900 text-yellow-400',
  status_change: 'bg-cyan-900 text-cyan-400',
  invite_sent: 'bg-indigo-900 text-indigo-400',
}

export default function SuperAdminLogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAction, setFiltroAction] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const url = filtroAction ? `/api/super-admin/logs?action=${filtroAction}&limit=200` : '/api/super-admin/logs?limit=200'
    fetch(url).then(r => r.json()).then(d => {
      setLogs(d.logs ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filtroAction])

  const acoes = Array.from(new Set(logs.map(l => l.action)))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Logs de Auditoria ({logs.length})</h1>
        <select
          value={filtroAction}
          onChange={e => { setFiltroAction(e.target.value); setLoading(true) }}
          className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm outline-none"
        >
          <option value="">Todas as ações</option>
          {acoes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700">
          {logs.length === 0 && (
            <p className="text-slate-500 text-center py-8">Nenhum log encontrado.</p>
          )}
          {logs.map(log => (
            <div
              key={log.id}
              className="px-4 py-3 cursor-pointer hover:bg-slate-750"
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_COLORS[log.action] ?? 'bg-slate-700 text-slate-300'}`}>
                    {log.action}
                  </span>
                  <div>
                    <p className="text-white text-sm font-medium">
                      {log.target_type} <span className="text-slate-400 font-normal">#{log.target_id.slice(0, 8)}…</span>
                    </p>
                    <p className="text-slate-400 text-xs">
                      por {log.actor_email ?? log.actor_id.slice(0, 8)}
                      {log.empresas && <> · {log.empresas.nome}</>}
                    </p>
                  </div>
                </div>
                <p className="text-slate-500 text-xs">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
              </div>
              {expanded === log.id && Object.keys(log.details).length > 0 && (
                <pre className="mt-3 bg-slate-900 rounded-lg p-3 text-xs text-slate-300 overflow-auto">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
