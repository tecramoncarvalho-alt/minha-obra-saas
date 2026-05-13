# Minha Obra — SaaS de Gestão de Obras com Linha de Balanço

Plataforma multi-tenant para planejamento e monitoramento de obras usando o método de **Linha de Balanço**. Cada empresa gerencia suas obras, equipes e apontamentos diários, com comparativo em tempo real entre o planejado e o realizado.

## Funcionalidades

### Planejamento
- **Linha de Balanço interativa** — gráfico pavimento × tempo com drag-and-drop, vínculos de dependência, zoom e filtros
- **Blocos e pavimentos** — estrutura hierárquica com criação em lote
- **Subatividades por equipe** — cada equipe com efetivo e duração em dias úteis
- **Versões / snapshots** — salvar versões "Definitiva" (imutável) ou "Em Atualização"; dashboard visualiza qualquer versão
- **Calendário configurável** — sábados, domingos e feriados por obra; todos os cálculos em dias úteis

### Monitoramento
- **Apontamentos diários** — efetivo real, % executado, status (Em Andamento / Paralisada / Concluída) e foto de medição
- **Dashboard com 4 abas**: Home (KPIs), Planejamento (desvios + Curva S), Tempo Real (apontamentos do dia em polling 30s), Relatórios
- **Curva S** — avanço acumulado planejado vs. real
- **Atividades em atenção** — filtro automático por desvio > 10%, prazo vencido e status Paralisada

### Mobile / Offline
- **PWA instalável** — manifest com ícones, display standalone, suporte a "Adicionar à tela inicial"
- **Fila offline** — apontamentos salvos localmente (IndexedDB/Dexie) quando sem internet; sincronizados automaticamente ao reconectar
- **Detecção de conflito** — se um apontamento foi editado no servidor enquanto o dispositivo estava offline, exibe modal para escolher entre a versão local e a do servidor
- **Accordion mobile-first** — touch targets ≥ 44px, font-size ≥ 16px (sem zoom iOS), auto-colapso após salvar

### Multi-tenant e Acesso
- **Onboarding** — criar empresa (gera código de 8 dígitos) ou solicitar entrada por código
- **4 roles**: `admin`, `planejador`, `operator`, `viewer`
- **Solicitações de acesso** — join requests aprovadas pelo admin com escolha de role
- **Convite por email** — admin convida membro diretamente
- **Planos de assinatura** — Free / Pro / Enterprise com limites de usuários, obras e storage

### Admin Panel (`/admin`)
- Dados da empresa, código copiável, plano e status de assinatura
- Gerenciar membros: alterar roles, aprovar/rejeitar solicitações, convidar por email
- Deletar empresa (apenas `is_owner`)

### Super Admin (`/super-admin`)
- Dashboard global com totais e breakdown por status
- Gerenciar todas as empresas: alterar plano, status e data de expiração
- CRUD de planos
- Visualizar todos os usuários do sistema
- Logs de auditoria com filtro por ação

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16.2.4 (App Router) + React 19 |
| Linguagem | TypeScript 5 |
| Estilos | Tailwind CSS v4 (sem bibliotecas de componentes) |
| Banco + Auth | Supabase (Postgres + Auth + Storage) |
| Cache | React Query 5.100.9 |
| Offline | Dexie.js (IndexedDB) |
| Gráficos | Recharts 3.8.1 (apenas Curva S) |
| Validação | Zod 4.4.2 |
| Testes | Vitest 4.1.5 |
| Deploy | Vercel (branch `main`) |

## Desenvolvimento

```bash
npm run dev      # servidor local com Turbopack — http://localhost:3000
npm run build    # build de produção
npm run lint     # ESLint
npm test         # Vitest — 17 testes unitários
```

Variáveis de ambiente em `.env.local` (não commitado). Necessário:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Estrutura de Roles

| Ação | viewer | operator | planejador | admin |
|------|:------:|:--------:|:----------:|:-----:|
| Visualizar | ✅ | ✅ | ✅ | ✅ |
| Apontamentos | ❌ | ✅ | ✅ | ✅ |
| Linha de Balanço / Obras | ❌ | ❌ | ✅ | ✅ |
| Gerenciar membros | ❌ | ❌ | ❌ | ✅ |
| Deletar empresa | ❌ | ❌ | ❌ | ✅ (is_owner) |
