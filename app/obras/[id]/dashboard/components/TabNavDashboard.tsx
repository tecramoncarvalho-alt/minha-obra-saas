'use client'

import { TAB_CONFIGS, type TabId } from '../tabs/types'

interface Props {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function TabNavDashboard({ activeTab, onTabChange }: Props) {
  return (
    <>
      {/* ── Desktop: sidebar esquerda ── */}
      <nav className="hidden md:flex flex-col w-52 bg-white border-r border-slate-200 px-3 py-6 gap-1 flex-shrink-0">
        {TAB_CONFIGS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-semibold transition-colors text-left ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Mobile: bottom bar fixo ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 flex">
        {TAB_CONFIGS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-semibold transition-colors border-t-2 ${
              activeTab === tab.id
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
