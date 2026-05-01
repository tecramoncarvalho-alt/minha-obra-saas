# Minha Obra

SaaS multi-tenant de gestão de obras com Linha de Balanço.

## Stack

- **Next.js 16.2.4** (App Router) com React 19
- **TypeScript 5**
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage)
- **Vercel** (deploy — branch `main`)

## Desenvolvimento

```bash
npm run dev    # http://localhost:3000 (Turbopack)
npm run build  # build de produção
npm run lint   # ESLint
```

Variáveis de ambiente em `.env.local` (não commitado — contém `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Estrutura principal

```
app/
├── lib/types.ts                    # Interfaces centralizadas (Obra, Atividade, Versao, …)
├── calendario.ts                   # Fonte de verdade para cálculos de dias úteis
├── obras/[id]/
│   ├── linha-balanco/              # Módulo principal do gráfico
│   │   ├── page.tsx                # Orquestrador (~1370 linhas)
│   │   ├── utils/                  # geradorCores.ts, helpers.ts
│   │   ├── hooks/                  # useCalendarioAtividades, useAtividades,
│   │   │                           # useVinculos, useDragAndDrop, useConflitos
│   │   └── components/             # GraficoLinhaBalanco, BarraAtividade,
│   │       ├── modais/             #   CalendarioHeader, SVGVinculos, LegendaCores,
│   │       └── …                   #   ToolbarSuperior, HeaderLinhaBalanco,
│   │                               #   BannersLinhaBalanco, ContextMenu,
│   │                               #   TooltipAtividade, TelaCheia
│   │                               # + 9 modais em components/modais/
│   ├── dashboard/page.tsx
│   ├── criacao-em-lote/page.tsx
│   └── editar-bloco/[bloco]/page.tsx
lib/supabase/client.ts              # Singleton browser client
```

## Autenticação

- `proxy.ts` (não `middleware.ts`) — intercepta todas as rotas
- Rotas públicas: `/login`, `/signup`, `/auth/callback`
- `AuthProvider` em `app/providers.tsx` — contexto global `useAuth()`

## Regras de negócio importantes

- `duracao_dias` de atividades é sempre em **dias úteis** (nunca corridos)
- Vínculos de dependência propagam a cadeia inteira no drag-and-drop
- Versão "Definitiva" é read-only; edições requerem criação de rascunho
- Calendário configurável por obra: `sabado_util`, `domingo_util`, tabela `feriados`
