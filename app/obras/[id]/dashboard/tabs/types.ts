export type TabId = 'home' | 'planejamento' | 'realtime' | 'relatorios'

export interface TabConfig {
  id: TabId
  label: string
  icon: string
}

export const TAB_CONFIGS: TabConfig[] = [
  { id: 'home',         label: 'Resumo',      icon: '📊' },
  { id: 'planejamento', label: 'Planejamento', icon: '📋' },
  { id: 'realtime',     label: 'Tempo Real',  icon: '🔴' },
  { id: 'relatorios',   label: 'Relatórios',  icon: '📈' },
]
