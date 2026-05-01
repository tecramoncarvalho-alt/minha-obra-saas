@AGENTS.md

---

## Visão Geral

**Minha Obra** é um SaaS multi-tenant de gestão de obras com Linha de Balanço. Cada empresa cadastra suas obras, cria blocos e pavimentos, e programa atividades em um gráfico interativo que exibe o fluxo de trabalho por pavimento ao longo do tempo. O sistema calcula prazos em dias úteis configuráveis por obra (sábados, domingos e feriados opcionais), suporta vínculos de dependência entre atividades, drag-and-drop no gráfico, subatividades por equipe, snapshots de versão e dashboard de efetivo diário.

---

## Stack

- **Next.js 16.2.4** (App Router) com React 19
- **TypeScript 5**
- **Tailwind CSS v4** — Tailwind puro, sem shadcn/ui ou outras bibliotecas de componentes
- **Supabase** (Postgres + Auth + Storage) — `@supabase/ssr` 0.10.2 para SSR/cookies, `@supabase/supabase-js` 2.104.1
- **Vercel** (deploy em produção, branch `main`)

---

## Arquitetura

```
plansaas/
├── proxy.ts                          # Proteção de rotas (Next.js 16 — NÃO é middleware.ts)
├── app/
│   ├── layout.tsx                    # RootLayout — envolve tudo com <AuthProvider>
│   ├── providers.tsx                 # AuthContext: user, empresa, role, signOut, loading
│   ├── calendario.ts                 # FONTE DE VERDADE para cálculos de datas úteis
│   ├── page.tsx                      # Home: lista e criação de obras
│   ├── login/page.tsx                # Login email+senha e Google OAuth
│   ├── signup/page.tsx               # Cadastro com confirmação por email
│   ├── setup/page.tsx                # Primeiro acesso: criar empresa
│   ├── auth/callback/route.ts        # Callback PKCE (code) e OTP (token_hash)
│   ├── api/invite/route.ts           # POST: convite de membro via service role
│   ├── configuracoes/equipe/page.tsx # Gestão de membros (admin only)
│   ├── lib/
│   │   └── types.ts                  # Interfaces centralizadas: Obra, Pavimento, Atividade, Versao, etc.
│   └── obras/[id]/
│       ├── page.tsx                  # Config da obra: pavimentos, feriados, foto
│       ├── linha-balanco/
│       │   ├── page.tsx              # Orquestrador (~1370 linhas; era ~3230 antes da refatoração)
│       │   ├── utils/
│       │   │   ├── geradorCores.ts   # PALETTE, getCor, getCorSub, calcDuracaoTotal
│       │   │   └── helpers.ts        # fmtDate, gerarUUID
│       │   ├── hooks/
│       │   │   ├── useCalendarioAtividades.ts  # calcDataFimUtil, calcInicioUtil, isDiaUtil
│       │   │   ├── useAtividades.ts            # working-copy mutations (CRUD local)
│       │   │   ├── useVinculos.ts              # linhasVinculo, handleQuebrarVinculo
│       │   │   ├── useDragAndDrop.ts           # drag state + propagação de vínculo
│       │   │   └── useConflitos.ts             # useMemo de conflitos de sobreposição
│       │   └── components/
│       │       ├── GraficoLinhaBalanco.tsx     # Grid + pavimentos + barras (usado em normal E tela cheia)
│       │       ├── BarraAtividade.tsx          # Barra individual + subatividades
│       │       ├── CalendarioHeader.tsx        # Eixo X com dias/meses
│       │       ├── SVGVinculos.tsx             # Overlay SVG de linhas de vínculo
│       │       ├── LegendaCores.tsx            # Legenda de equipes/cores
│       │       ├── ToolbarSuperior.tsx         # Zoom + filtros + imprimir
│       │       ├── HeaderLinhaBalanco.tsx      # Cabeçalho da página com stats e ações
│       │       ├── BannersLinhaBalanco.tsx     # Banners de leitura/rascunho/mensagem
│       │       ├── ContextMenu.tsx             # Menu de contexto do gráfico
│       │       ├── TooltipAtividade.tsx        # Tooltip ao hover em atividade
│       │       ├── TelaCheia.tsx               # Overlay de tela cheia (usa GraficoLinhaBalanco)
│       │       └── modais/
│       │           ├── ModalCriarAtividade.tsx
│       │           ├── ModalEditarAtividade.tsx
│       │           ├── ModalVincular.tsx
│       │           ├── ModalExcluirComVinculo.tsx
│       │           ├── ModalFiltroPavimentos.tsx
│       │           ├── ModalSalvarVersao.tsx
│       │           ├── ModalHistoricoVersoes.tsx
│       │           ├── ModalEditarLinhas.tsx
│       │           └── ModalSaida.tsx
│       ├── dashboard/page.tsx        # Efetivo diário e versões/snapshots
│       ├── criacao-em-lote/page.tsx  # Wizard de criação de blocos e pavimentos
│       └── editar-bloco/[bloco]/page.tsx  # Editar nome, tipo e pavimentos de um bloco
│           pavimentos/[pavimentoId]/page.tsx  # Detalhe de um pavimento
├── components/
│   └── Header.tsx                    # Header global: logo, empresa, role, logout
├── lib/
│   └── supabase/
│       └── client.ts                 # Singleton browser client (createBrowserClient)
└── public/
```

### Fluxo de autenticação

1. `proxy.ts` intercepta todas as requisições (exceto `_next/*`, assets estáticos)
2. Rotas públicas: `/login`, `/signup`, `/auth/callback`
3. Usuário autenticado sem empresa → redirecionado para `/setup`
4. `AuthProvider` em `providers.tsx` expõe contexto global via `useAuth()`

### Cliente Supabase

- **Browser**: `lib/supabase/client.ts` — singleton via `createBrowserClient` do `@supabase/ssr`
- **Server (proxy, callbacks, API routes)**: `createServerClient` do `@supabase/ssr` com cookies do request
- **Admin (service role)**: instância avulsa de `@supabase/supabase-js` criada dentro de API routes, nunca exposta ao browser

> **Atenção**: As páginas dentro de `obras/[id]` (exceto `linha-balanco`) ainda usam `createClient` direto do `@supabase/supabase-js`. Isso causa conflito de lock de sessão. Migrar para `@/lib/supabase/client` é dívida técnica pendente. O módulo `linha-balanco` já foi migrado.

---

## Convenções de Código

- Componentes em **PascalCase** (`Header`, `LinhaDeBalanco`)
- Hooks em **camelCase** com prefixo `use` (`useAuth`)
- Helpers em **camelCase** (`calcularDataFim`, `addDiasUteis`)
- Interfaces TypeScript centralizadas em `app/lib/types.ts` (`Obra`, `Pavimento`, `Atividade`, `Versao`, `SnapshotPavimento`, etc.)
- **Nunca usar `any`** em TypeScript
- **Datas**: SEMPRE usar os helpers de `app/calendario.ts` (`calcularDataFim`, `calcularDuracaoUtil`, `addDiasUteis`, `isDiaUtil`)
- **NUNCA** usar `addDias` simples para calcular duração de atividades — atividades operam em dias úteis
- **Estado reativo**: `useState` para dados de UI, `useRef` para valores que precisam ser acessados dentro de callbacks e event handlers sem re-render (ex: `calendarioRef` na linha de balanço)
- Queries Supabase **sempre** filtradas por `empresa_id` (ou por `obra_id` que já pertence à empresa)
- Tailwind puro — sem shadcn/ui, Radix, ou outras bibliotecas de componentes

---

## Schema do Banco

```sql
-- Multi-tenancy
empresas          (id uuid PK, nome text, created_at)
usuarios_empresas (user_id uuid FK auth.users, empresa_id uuid FK empresas,
                   role text CHECK('admin','editor','viewer'),
                   created_at, UNIQUE(user_id, empresa_id))

-- Obras
obras      (id bigint PK, empresa_id uuid FK empresas,
            nome text, descricao text,
            data_inicio date, data_fim date, foto_url text,
            sabado_util bool DEFAULT false,
            domingo_util bool DEFAULT false,
            created_at)

feriados   (id bigint PK, obra_id bigint FK obras,
            data text 'YYYY-MM-DD', nome text)

-- Estrutura
pavimentos (id bigint PK, obra_id bigint FK obras,
            nome text,       -- formato: "NomeBloco - NomePavimento"
            numero int,      -- ordem numérica do pavimento
            observacao text, -- metadados do bloco no 1º pavimento (ver abaixo)
            created_at)

-- Atividades
atividades  (id bigint PK, pavimento_id bigint FK pavimentos,
             nome text, data_inicio date, data_fim date,
             duracao_dias int,   -- em DIAS ÚTEIS
             equipe text, efetivo int,
             linha_index int,    -- linha visual quando há múltiplas atividades por pavimento
             vinculo_id text,    -- UUID da cadeia de vínculo
             vinculo_ordem int)  -- posição na cadeia

subatividades (id bigint PK, atividade_id bigint FK atividades,
               nome text, duracao int, -- dias úteis
               equipe text, efetivo int, ordem int)

-- Versionamento
versoes (id bigint PK, obra_id bigint FK obras,
         nome text, descricao text,
         status text CHECK('Definitiva','Em Atualização'),
         snapshot jsonb,  -- { pavimentos: [...] } — cópia completa do estado
         created_at)
```

### Metadados de bloco no campo `observacao`

O primeiro pavimento de cada bloco armazena metadados no campo `observacao` com o formato:

```
__BLOCO__tipo=Torre||obs=Descrição do bloco||linhas=2
```

Helpers `parseMeta` e `buildMeta` (duplicados em `linha-balanco/page.tsx`, `obras/[id]/page.tsx` e `editar-bloco/`) fazem a serialização/deserialização.

### Agrupamento de blocos

Pavimentos são agrupados em blocos pelo nome: `"Torre A - Térreo"` → bloco `"Torre A"`, pavimento `"Térreo"`. A separação é pelo primeiro ` - ` no nome.

---

## Regras de Negócio Críticas

- **Dias úteis**: `duracao_dias` de atividades e subatividades é sempre em **dias úteis**, nunca corridos
- **Configuração por obra**: `sabado_util` e `domingo_util` são configurados individualmente em cada obra
- **Feriados por obra**: tabela `feriados` vinculada à obra, não global
- **Vínculos de dependência**: `vinculo_id` é um UUID de cadeia; `vinculo_ordem` é a posição. Atividades com mesmo `vinculo_id` formam uma sequência. Ao mover uma, todas as posteriores na cadeia são propagadas
- **Drag-and-drop na linha de balanço**: propaga a cadeia inteira. Usa `useRef` para acessar o estado do calendário dentro dos event handlers sem fechar sobre valores desatualizados
- **Versão "Definitiva"**: read-only. Não pode ter atividades alteradas. Snapshot armazena cópia completa do estado da obra em `jsonb`
- **Linha "Hoje"**: linha vermelha vertical no gráfico; aparece apenas quando a data atual está dentro do intervalo visível. Normaliza para meia-noite antes de calcular o offset em pixels

---

## Padrões de Resposta

- Sempre mostre um **plano** antes de modificar arquivos com mais de 300 linhas
- **Não modifique** `linha-balanco/page.tsx` (~1370 linhas) sem antes apresentar o plano e a localização exata da mudança
- Quebre componentes acima de **500 linhas**
- Sugira testes para qualquer helper em `calendario.ts`
- Avise se uma mudança quebra retrocompatibilidade de snapshots (campo `versoes.snapshot`)
- Ao adicionar queries Supabase, sempre inclua filtro `empresa_id` ou garanta que o filtro vem via RLS

---

## Comandos Úteis

```bash
npm run dev    # servidor de desenvolvimento (Next.js com Turbopack)
npm run build  # build de produção
npm run lint   # ESLint
```

O servidor de dev roda em `http://localhost:3000`. Variáveis de ambiente ficam em `.env.local` (não commitado).

---

## Coisas a EVITAR

- **Não usar `any`** em TypeScript
- **Não fazer queries Supabase sem filtro** de `empresa_id` ou `obra_id`
- **Não criar componentes monolíticos** acima de 500 linhas — refatorar antes de expandir
- **Não modificar diretamente** o snapshot de versão "Definitiva" — é imutável após criação
- **Não usar `middleware.ts`** — Next.js 16 usa `proxy.ts` com `export function proxy()`
- **Não usar `router.push` + `router.refresh`** após login — usar `window.location.href = '/'` para garantir que o proxy leia os cookies de sessão corretamente
- **Não criar novas instâncias** de `@supabase/supabase-js` direto nas páginas — usar `@/lib/supabase/client` (que é singleton)
- **Não usar `addDias`** para calcular prazo de atividades — usar `calcularDataFim` de `app/calendario.ts`
- **Não usar shadcn/ui** ou qualquer biblioteca de componentes — Tailwind puro

---

## Progresso / Changelog

### 2026-04-29 — Refatoração completa de `linha-balanco/page.tsx`

**Motivação**: o arquivo havia crescido para ~3230 linhas, tornando manutenção e revisão muito custosas.

**O que foi feito**:
- `page.tsx` reduzido de **~3230 → ~1370 linhas** (orquestrador puro)
- **25 novos arquivos** criados: 5 hooks, 2 utils, 11 componentes, 9 modais
- **Zero `any`** no módulo — todos os tipos foram explicitados
- **Supabase singleton** adotado (`@/lib/supabase/client`) — resolve bug de lock de sessão
- **`app/calendario.ts` como fonte de verdade** — helpers locais duplicados removidos
- **`app/lib/types.ts`** criado com todas as interfaces compartilhadas
- **`GraficoLinhaBalanco`** serve tanto o modo normal quanto a tela cheia (elimina ~280 linhas duplicadas)
- Lint do módulo `linha-balanco`: **zero erros, zero warnings**
- Build de produção: **verde** (`✓ Compiled successfully`)

**Arquivos criados**:
```
linha-balanco/
  utils/geradorCores.ts, utils/helpers.ts
  hooks/useCalendarioAtividades.ts, useAtividades.ts, useVinculos.ts,
        useDragAndDrop.ts, useConflitos.ts
  components/GraficoLinhaBalanco.tsx, BarraAtividade.tsx, CalendarioHeader.tsx,
             SVGVinculos.tsx, LegendaCores.tsx, ToolbarSuperior.tsx,
             HeaderLinhaBalanco.tsx, BannersLinhaBalanco.tsx,
             ContextMenu.tsx, TooltipAtividade.tsx, TelaCheia.tsx
  components/modais/ (9 modais extraídos)
app/lib/types.ts
```
