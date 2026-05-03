'use client'

import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { CurvaSPoint } from '@/app/lib/types'

interface Props {
  dados: CurvaSPoint[]
}

interface TooltipPayload {
  value: number
  name: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-gray-600 mb-1">Dia útil {label}</p>
      {payload.map(p => (
        <p key={p.name} className={p.name === 'previsto' ? 'text-blue-600' : 'text-green-600'}>
          {p.name === 'previsto' ? 'Previsto' : 'Real'}: {p.value}%
        </p>
      ))}
    </div>
  )
}

export function CurvaS({ dados }: Props) {
  if (dados.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Curva S — Avanço Acumulado</h3>
        <div className="flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <span className="inline-block w-3 h-0.5 bg-blue-400 rounded" />
            Previsto
          </span>
          <span className="flex items-center gap-1 text-xs text-green-600">
            <span className="inline-block w-3 h-0.5 bg-green-500 rounded" />
            Real
          </span>
        </div>
      </div>
      <div className="px-2 py-4">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={dados} margin={{ top: 4, right: 16, bottom: 16, left: 0 }}>
            <defs>
              <linearGradient id="gradPrevisto" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="diasUteis"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              label={{ value: 'Dias úteis', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="previsto"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#gradPrevisto)"
              dot={false}
              name="previsto"
            />
            <Line
              type="monotone"
              dataKey="real"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              name="real"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
