@AGENTS.md

---

## Visão Geral

**Minha Obra** é um SaaS multi-tenant de gestão de obras com Linha de Balanço. Cada empresa cadastra suas obras, cria blocos e pavimentos, e programa atividades em um gráfico interativo que exibe o fluxo de trabalho por pavimento ao longo do tempo. O sistema calcula prazos em dias úteis configuráveis por obra (sábados, domingos e feriados opcionais), suporta vínculos de dependência entre atividades, drag-and-drop no gráfico, subatividades por equipe, snapshots de versão, apontamentos diários reais e dashboard de monitoramento planejado vs. real.

---

## Contexto de Negócio

Estes conceitos são fundamentais para entender qualquer pedido relacionado ao domínio:

| Termo | Definição |
|---|---|
| **Linha de Balanço** | Método de planeamento onde cada atividade é uma linha inclinada num gráfico pavimento × tempo. O ritmo de produção (inclinação) deve ser constante e sem cruzamentos. É o gráfico principal do sistema. |
| **Efetivo** | Número de trabalhadores alocados a uma atividade. "Efetivo previsto" vem do planeamento; "efetivo real" é registado diariamente. Aderência < 80% é crítico. |
| **Avanço Físico** | Percentagem de execução de uma atividade (0–100%). Registado no apontamento diário pelo encarregado/engenheiro. |
| **Apontamento** | Registo diário do estado real de uma atividade: efetivo real, % executado, status e observações. É a fonte de dados do comparativo planejado vs. real. |
| **Desvio de Prazo** | Diferença entre avanço % previsto pelo planeamento e avanço % real, convertido em **dias úteis**. Negativo = atraso; positivo = adiantamento. |
| **Curva S** | Gráfico acumulado de avanço físico ao longo do tempo (eixo X = dias úteis). A curva planeada tem forma de "S"; a real deve acompanhá-la. |
| **Dias Úteis** | O sistema opera **exclusivamente** em dias úteis configuráveis por obra. `contarDiasUteis()` de `app/calendario.ts` é a única fonte de verdade — nunca usar diferença de dias corridos. |
| **Aderência de Efetivo** | Rácio efetivo real / efetivo previsto em %. Exibido no dashboard como KPI. |
| **PARALISADA** | Status de atividade que indica interrupção: efetivo zerado, progresso preservado. Gera alerta no dashboard e hachura na linha de balanço. |
| **Bloco** | Agrupamento de pavimentos. O nome do pavimento tem formato `"Torre A - Térreo"` — bloco = parte antes do primeiro ` - `. |
| **Vínculo** | Dependência entre atividades. `vinculo_id` é UUID de cadeia; ao mover uma atividade, todas as posteriores propagam automaticamente. |
| **Versão Definitiva** | Snapshot read-only do estado da obra. Imutável após criação. O dashboard pode visualizar qualquer versão. |

---

## Stack

- **Next.js 16.2.4** (App Router) com React 19
- **TypeScript 5**
- **Tailwind CSS v4** — Tailwind puro, sem shadcn/ui ou outras bibliotecas de componentes
- **Supabase** (Postgres + Auth + Storage) — `@supabase/ssr` 0.10.2 para SSR/cookies, `@supabase/supabase-js` 2.104.1
- **Recharts 3.8.1** — apenas para Curva S no dashboard
- **Vitest 4.1.5** — testes unitários de funções puras em `app/lib/`
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
│   ├── api/
│   │   ├── invite/route.ts                           # POST: convite de membro via service role
│   │   ├── empresa/[id]/storage-quota/route.ts       # GET: quota de storage (cache 5min)
│   │   ├── medicoes/upload/route.ts                  # POST: upload foto (magic bytes, máx 1MB)
│   │   └── obras/[id]/
│   │       ├── apontamentos/route.ts                 # GET (filtros data/range) + POST
│   │       └── apontamentos/[apontamentoId]/route.ts # PUT + DELETE
│   ├── configuracoes/equipe/page.tsx # Gestão de membros (admin only)
│   ├── lib/
│   │   ├── types.ts                  # Interfaces centralizadas (Obra, Atividade, ApontamentoDiario, …)
│   │   ├── calculador-avanco.ts      # Funções puras: desvio, CurvaS, deltaEfetivo, resumoObra
│   │   └── apontamentos.ts           # Helpers de BD: getApontamentosDoDia, atualizarApontamento, …
│   └── obras/[id]/
│       ├── page.tsx                  # Config da obra: pavimentos, feriados, foto
│       ├── linha-balanco/
│       │   ├── page.tsx              # Orquestrador (~1370 linhas)
│       │   ├── utils/
│       │   │   ├── geradorCores.ts   # PALETTE, getCor, getCorSub, calcDuracaoTotal
│       │   │   └── helpers.ts        # fmtDate, gerarUUID
│       │   ├── hooks/
│       │   │   ├── useCalendarioAtividades.ts
│       │   │   ├── useAtividades.ts
│       │   │   ├── useVinculos.ts
│       │   │   ├── useDragAndDrop.ts
│       │   │   └── useConflitos.ts
│       │   └── components/
│       │       ├── GraficoLinhaBalanco.tsx  # Grid + barras (normal E tela cheia)
│       │       │                            # Props: mostrarAvancoReal + progrealPorAtividade
│       │       ├── BarraAtividade.tsx
│       │       ├── CalendarioHeader.tsx
│       │       ├── SVGVinculos.tsx
│       │       ├── LegendaCores.tsx
│       │       ├── ToolbarSuperior.tsx      # Zoom + filtros + toggle Avanço Real + imprimir
│       │       ├── HeaderLinhaBalanco.tsx
│       │       ├── BannersLinhaBalanco.tsx
│       │       ├── ContextMenu.tsx
│       │       ├── TooltipAtividade.tsx
│       │       ├── TelaCheia.tsx
│       │       └── modais/ (9 modais)
│       ├── dashboard/
│       │   ├── page.tsx              # Orquestrador do dashboard (~1100 linhas)
│       │   └── components/
│       │       ├── KpiCards.tsx         # % conclusão, desvio, aderência, críticas
│       │       ├── AlertasParalisadas.tsx
│       │       ├── GridEfetivo.tsx      # Previsto vs real + barras duplas
│       │       ├── CurvaS.tsx           # AreaChart (Recharts)
│       │       ├── RowHighlight.tsx     # Linha reutilizável c/ desvio, delta, status
│       │       └── TabelaAtencao.tsx    # Filtros automáticos + drawer histórico
│       ├── apontamentos/page.tsx     # Formulário de apontamento diário por atividade
│       ├── criacao-em-lote/page.tsx  # Wizard de criação de blocos e pavimentos
│       └── editar-bloco/[bloco]/page.tsx
│           pavimentos/[pavimentoId]/page.tsx
├── components/
│   └── Header.tsx                    # Header global: logo, empresa, role, logout
├── lib/
│   └── supabase/client.ts            # Singleton browser client (createBrowserClient)
├── __tests__/
│   └── calculadorAvanco.test.ts      # 17 testes Vitest
└── vitest.config.ts
```

### Fluxo de autenticação

1. `proxy.ts` intercepta todas as requisições (exceto `_next/*`, assets estáticos)
2. Rotas públicas: `/login`, `/signup`, `/auth/callback`
3. Usuário autenticado sem empresa → redirecionado para `/setup`
4. `AuthProvider` em `providers.tsx` expõe contexto global via `useAuth()`

### Cliente Supabase

- **Browser**: `lib/supabase/client.ts` — singleton via `createBrowserClient` do `@supabase/ssr`. **Todas** as páginas usam este singleton.
- **Server (proxy, callbacks, API routes)**: `createServerClient` do `@supabase/ssr` com cookies do request
- **Admin (service role)**: instância avulsa de `@supabase/supabase-js` criada dentro de API routes, nunca exposta ao browser

---

## Convenções de Código

- Componentes em **PascalCase** (`Header`, `LinhaDeBalanco`)
- Hooks em **camelCase** com prefixo `use` (`useAuth`)
- Helpers em **camelCase** (`calcularDataFim`, `addDiasUteis`)
- Interfaces TypeScript centralizadas em `app/lib/types.ts`
- **Nunca usar `any`** em TypeScript
- **Datas**: SEMPRE usar os helpers de `app/calendario.ts` (`calcularDataFim`, `calcularDuracaoUtil`, `addDiasUteis`, `isDiaUtil`, `contarDiasUteis`)
- **Cálculos de avanço**: SEMPRE usar `app/lib/calculador-avanco.ts` — nunca implementar lógica de desvio inline
- **Estado reativo**: `useState` para dados de UI, `useRef` para valores que precisam ser acessados dentro de callbacks e event handlers sem re-render
- Queries Supabase **sempre** filtradas por `empresa_id` (ou por `obra_id` que já pertence à empresa)
- Tailwind puro — sem shadcn/ui, Radix, ou outras bibliotecas de componentes
- Drawer/Modal/Overlay = `div` fixo com Tailwind — sem bibliotecas externas

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
            nome text, descricao text, foto_url text,
            data_inicio date, data_fim date,
            sabado_util bool DEFAULT false,
            domingo_util bool DEFAULT false,
            created_at)

feriados   (id bigint PK, obra_id bigint FK obras,
            data text 'YYYY-MM-DD', nome text)

-- Estrutura
pavimentos (id bigint PK, obra_id bigint FK obras,
            nome text,       -- formato: "NomeBloco - NomePavimento"
            numero int,      -- ordem numérica do pavimento
            observacao text, -- metadados do bloco no 1º pavimento (parseMeta/buildMeta)
            created_at)

-- Planeamento
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

-- Registo Real
apontamentos_diarios (id uuid PK, atividade_id bigint FK atividades,
                      data text 'YYYY-MM-DD',
                      efetivo_real int,
                      percentual_executado int,  -- 0-100
                      status text CHECK('NAO_INICIADA','INICIADA','EM_ANDAMENTO',
                                        'CONCLUIDA_NO_DIA','PARALISADA')
                                   DEFAULT 'EM_ANDAMENTO',
                      observacao text, responsavel text,
                      created_by uuid FK auth.users,
                      created_at, updated_at)

-- Medições com Fotos
medicoes (id uuid PK, atividade_id bigint FK atividades,
          apontamento_id uuid FK apontamentos_diarios,
          data_medicao text 'YYYY-MM-DD',
          quantidade_executada numeric, unidade text,
          responsavel text, foto_url text, observacao text,
          created_by uuid FK auth.users, created_at)

-- Storage e Auditoria
storage_quotas (id uuid PK, empresa_id uuid FK empresas,
                storage_usado_bytes bigint, storage_limite_bytes bigint,
                plano text CHECK('free','pro','empresa'),
                percentual_usado numeric, created_at, updated_at)

logs_upload (id uuid PK, obra_id bigint, arquivo_nome text,
             arquivo_tamanho bigint, bucket text,
             status text CHECK('sucesso','falha'),
             erro_mensagem text, user_id uuid, created_at)

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

## Calculador de Avanço (`app/lib/calculador-avanco.ts`)

Todas as funções são **puras** (sem side effects, testáveis) e recebem `config: ConfigCalendario` para os cálculos de dias úteis.

| Função | Descrição |
|---|---|
| `calcularDesvioPrazo(at, config, dataRef?, ap?)` | Desvio % (real − previsto). Negativo = atraso. |
| `gerarDesviosPorAtividade(atividades, apontamentos, config, dataRef?)` | Lista de `DesvioAtividade` ordenada por desvio crescente. |
| `gerarResumoAvancoObra(obra, atividades, apontamentos, config, dataRef?)` | `ResumoAvancoObra` com todos os KPIs. |
| `calcularCurvaS(atividades, apontamentos, dataInicio, dataFim, config)` | Array `CurvaSPoint[]` com eixo X em dias úteis. |
| `calcularDeltaEfetivo(efetivoPrevisto, apontamento?)` | `DeltaEfetivo` com flag `critico` (real < 70% do previsto). |
| `formatarDesvioPrazo(desvioPercentual, duracaoDias)` | String "+N dias úteis" / "-N dias úteis". |

---

## Regras de Negócio Críticas

- **Dias úteis**: `duracao_dias` de atividades e subatividades é sempre em **dias úteis**. Nunca usar diferença de dias corridos em nenhum cálculo de prazo.
- **Configuração por obra**: `sabado_util` e `domingo_util` são configurados individualmente em cada obra
- **Feriados por obra**: tabela `feriados` vinculada à obra, não global
- **Vínculos de dependência**: `vinculo_id` é um UUID de cadeia; `vinculo_ordem` é a posição. Ao mover uma atividade, todas as posteriores na cadeia são propagadas
- **Drag-and-drop na linha de balanço**: propaga a cadeia inteira. Usa `useRef` para acessar o estado do calendário dentro dos event handlers sem fechar sobre valores desatualizados
- **Versão "Definitiva"**: read-only. Não pode ter atividades alteradas. Snapshot armazena cópia completa do estado da obra em `jsonb`. Nunca alterar a estrutura de `versoes.snapshot`.
- **Linha "Hoje"**: linha vermelha vertical no gráfico; aparece apenas quando a data atual está dentro do intervalo visível
- **Status PARALISADA**: zera efetivo na UI, mantém % executado, nunca regride progresso; gera alerta no dashboard e hachura diagonal na linha de balanço
- **Status CONCLUIDA_NO_DIA**: força percentual_executado = 100 no formulário
- **Regressão de progresso**: qualquer redução de % executado requer confirmação explícita do utilizador (`window.confirm`)
- **ConfigCalendario**: todas as funções de `calculador-avanco.ts` recebem `{ sabadoUtil, domingoUtil, feriados: string[] }` — nunca assumir valores padrão

---

## Padrões de Resposta

- Sempre mostre um **plano** antes de modificar arquivos com mais de 300 linhas
- **Não modifique** `linha-balanco/page.tsx` (~1370 linhas) sem antes apresentar o plano e a localização exata da mudança
- Quebre componentes acima de **500 linhas**
- Sugira testes Vitest para qualquer função pura em `app/lib/`
- Avise se uma mudança quebra retrocompatibilidade de snapshots (campo `versoes.snapshot`)
- Ao adicionar queries Supabase, sempre inclua filtro `empresa_id` ou garanta que o filtro vem via RLS
- Funções de cálculo de prazo/desvio devem **sempre** receber `ConfigCalendario` — nunca calcular dias corridos diretamente

---

## Comandos Úteis

```bash
npm run dev    # servidor de desenvolvimento (Next.js com Turbopack) — http://localhost:3000
npm run build  # build de produção (TypeScript + bundle)
npm run lint   # ESLint
npm test       # Vitest — 17 testes unitários em __tests__/calculadorAvanco.test.ts
npm test:watch # Vitest em modo watch (desenvolvimento de testes)
```

Variáveis de ambiente ficam em `.env.local` (não commitado).

---

## Coisas a EVITAR

- **Não usar `any`** em TypeScript
- **Não fazer queries Supabase sem filtro** de `empresa_id` ou `obra_id`
- **Não criar componentes monolíticos** acima de 500 linhas — refatorar antes de expandir
- **Não modificar diretamente** o snapshot de versão "Definitiva" — é imutável após criação
- **Não usar `middleware.ts`** — Next.js 16 usa `proxy.ts` com `export function proxy()`
- **Não usar `router.push` + `router.refresh`** após login — usar `window.location.href = '/'` para garantir que o proxy leia os cookies de sessão corretamente
- **Não criar novas instâncias** de `@supabase/supabase-js` direto nas páginas — usar `@/lib/supabase/client` (singleton)
- **Não usar `addDias` simples** para calcular prazo de atividades — usar `calcularDataFim` ou `addDiasUteis` de `app/calendario.ts`
- **Não usar `diffDiasCorreidos`** ou qualquer subtração simples de datas — sempre `contarDiasUteis(a, b, config)`
- **Não usar shadcn/ui** ou qualquer biblioteca de componentes — Tailwind puro
- **Não usar Recharts** fora de `CurvaS.tsx` — é dependência pesada, circunscrita ao dashboard
- **Não implementar lógica de desvio inline** nas páginas — usar `app/lib/calculador-avanco.ts`

---

## Progresso / Changelog

### 2026-05-02 — Sistema de Monitoramento Planejado vs. Real (Etapas 1–8)

**Motivação**: o sistema registava planeamento mas não capturava dados reais nem os comparava. Adicionada a camada analítica completa.

**Etapa 1 — Schema e Tipos**
- Adicionado campo `status` à tabela `apontamentos_diarios` com CHECK constraint
- `app/lib/types.ts`: `StatusAtividade`, `CurvaSPoint`, `DeltaEfetivo`, `DesvioAtividade.status_apontamento`

**Etapa 2 — Calculador de Avanço**
- `app/lib/calculador-avanco.ts` reescrito com dias úteis (`contarDiasUteis`)
- Removida `diffDiasCorreidos` — todas as funções recebem `ConfigCalendario`
- Novas funções: `formatarDesvioPrazo`, `calcularDeltaEfetivo`, `calcularCurvaS`

**Etapa 3 — Testes Vitest**
- `vitest.config.ts` criado
- `__tests__/calculadorAvanco.test.ts` com 17 testes (todos passam)
- Scripts `npm test` e `npm test:watch` adicionados ao `package.json`

**Etapa 4 — Formulário de Apontamento**
- `app/obras/[id]/apontamentos/page.tsx`: seletor de status, lógica automática por status, validação de regressão, banner PARALISADA

**Etapa 5 — Dashboard: KPIs, Alertas e Grid**
- `dashboard/components/KpiCards.tsx` — 4 cards de KPI com dias úteis
- `dashboard/components/AlertasParalisadas.tsx` — alertas vermelhos no topo
- `dashboard/components/GridEfetivo.tsx` — tabela previsto vs real com barras duplas
- `dashboard/page.tsx` actualizado: feriados + todosApontamentos + config + resumo + desvios + paralisadas

**Etapa 6 — Linha de Balanço: Avanço Real**
- `ToolbarSuperior.tsx`: toggle "Avanço Real"
- `GraficoLinhaBalanco.tsx`: props `mostrarAvancoReal` + `progrealPorAtividade`; overlay de dois segmentos (executado clareado / PARALISADA com hachura diagonal)
- `linha-balanco/page.tsx`: estado + fetch de apontamentos ao activar toggle

**Etapa 7 — Curva S**
- `recharts` instalado
- `dashboard/components/CurvaS.tsx`: AreaChart (previsto) + Line (real), tooltip customizado, eixo X dias úteis

**Etapa 8 — Atividades em Atenção**
- `dashboard/components/RowHighlight.tsx`: linha reutilizável com desvio, delta, status badge
- `dashboard/components/TabelaAtencao.tsx`: filtros automáticos (desvio > 10%, prazo vencido, PARALISADA) + drawer lateral de histórico

---

### 2026-04-29 — Refatoração completa de `linha-balanco/page.tsx`

**Motivação**: o arquivo havia crescido para ~3230 linhas, tornando manutenção e revisão muito custosas.

**O que foi feito**:
- `page.tsx` reduzido de **~3230 → ~1370 linhas** (orquestrador puro)
- **25 novos arquivos** criados: 5 hooks, 2 utils, 11 componentes, 9 modais
- **Zero `any`** no módulo — todos os tipos foram explicitados
- **Supabase singleton** adotado (`@/lib/supabase/client`) em todos os módulos
- **`app/calendario.ts` como fonte de verdade** — helpers locais duplicados removidos
- **`app/lib/types.ts`** criado com todas as interfaces compartilhadas
- **`GraficoLinhaBalanco`** serve tanto o modo normal quanto a tela cheia
- Build de produção: **verde** (`✓ Compiled successfully`)
