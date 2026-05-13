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
- **React Query 5.100.9** (`@tanstack/react-query`) — cache, sincronização e invalidação de queries
- **Recharts 3.8.1** — apenas para Curva S no dashboard
- **browser-image-compression 2.0.2** — compressão de fotos antes do upload (máx 0.8 MB, 1920px)
- **Dexie.js 4.x** — IndexedDB wrapper para offline queue de apontamentos (`app/lib/offline-db.ts`)
- **Zod 4.4.2** — validação de schema no upload e apontamentos
- **Vitest 4.1.5** — testes unitários de funções puras em `app/lib/`
- **Vercel** (deploy em produção, branch `main`)

---

## Arquitetura

```
plansaas/
├── proxy.ts                          # Proteção de rotas (Next.js 16 — NÃO é middleware.ts)
├── app/
│   ├── layout.tsx                    # RootLayout — envolve tudo com <AuthProvider>; themeColor + appleWebApp metadata
│   ├── manifest.ts                   # PWA manifest (App Router file-based): nome, ícones, display standalone
│   ├── providers.tsx                 # AuthProvider: AuthContext + QueryClientProvider + ReactQueryDevtools
│   ├── calendario.ts                 # FONTE DE VERDADE para cálculos de datas úteis
│   ├── hooks/
│   │   └── useOnlineStatus.ts        # navigator.onLine + eventos online/offline — usado em apontamentos
│   ├── page.tsx                      # Home: lista e criação de obras
│   ├── login/page.tsx                # Login email+senha e Google OAuth
│   ├── signup/page.tsx               # Cadastro com confirmação por email
│   ├── setup/page.tsx                # Legado — redireciona para /onboarding/criar
│   ├── auth/callback/route.ts        # Callback PKCE (code) e OTP (token_hash)
│   ├── onboarding/
│   │   ├── page.tsx                  # Seleção: Criar Empresa / Entrar em Empresa
│   │   ├── criar/page.tsx            # Form de criação: nome, CNPJ, endereço, email
│   │   └── buscar/page.tsx           # Buscar empresa por código de 8 dígitos + solicitar acesso
│   ├── admin/
│   │   ├── empresa/page.tsx          # Dados da empresa, plano, código, editar, deletar (is_owner)
│   │   └── membros/page.tsx          # Membros ativos, solicitações pendentes, convidar por email
│   ├── super-admin/
│   │   ├── layout.tsx                # Guard server-side: redireciona não-super-admins para /
│   │   ├── page.tsx                  # Dashboard global: totais, status breakdown
│   │   ├── empresas/page.tsx         # Listar + alterar plano/status/expires_at
│   │   ├── planos/page.tsx           # CRUD de planos
│   │   ├── usuarios/page.tsx         # Todos os usuários do sistema
│   │   └── logs/page.tsx             # audit_logs com filtro por ação
│   ├── api/
│   │   ├── me/route.ts               # GET: usuário + empresa + isOwner + isSuperAdmin + plano
│   │   ├── invite/route.ts           # POST: convite de membro via service role
│   │   ├── empresa/[id]/storage-quota/route.ts
│   │   ├── medicoes/upload/route.ts  # POST: upload foto (magic bytes, máx 1MB, vincula apontamento_id)
│   │   ├── onboarding/
│   │   │   ├── criar/route.ts        # POST: cria empresa + is_owner + audit_log
│   │   │   └── buscar/route.ts       # GET: busca por codigo_empresa | POST: cria join_request
│   │   ├── admin/
│   │   │   ├── empresa/route.ts      # PATCH: editar | DELETE: deletar empresa (is_owner)
│   │   │   ├── membros/route.ts      # GET: lista membros com emails via service_role
│   │   │   ├── membros/[userId]/role/route.ts  # PATCH: alterar role
│   │   │   └── join-requests/
│   │   │       ├── route.ts          # GET: solicitações pendentes com emails
│   │   │       └── [id]/route.ts     # PATCH: aprovar/rejeitar
│   │   ├── super-admin/
│   │   │   ├── check/route.ts        # GET: { isSuperAdmin }
│   │   │   ├── empresas/route.ts     # GET: todas as empresas
│   │   │   ├── empresas/[id]/route.ts # PATCH: plano/status | DELETE
│   │   │   ├── planos/route.ts       # GET all + POST create
│   │   │   ├── planos/[id]/route.ts  # PATCH + DELETE
│   │   │   ├── usuarios/route.ts     # GET: todos usuários com emails via listUsers()
│   │   │   └── logs/route.ts         # GET: audit_logs com emails via listUsers()
│   │   └── obras/[id]/
│   │       ├── apontamentos/route.ts                 # GET (filtros data/range) + POST
│   │       └── apontamentos/[apontamentoId]/route.ts # PUT + DELETE
│   ├── configuracoes/equipe/page.tsx # Redirect 301 → /admin/membros
│   ├── lib/
│   │   ├── types.ts                  # Interfaces centralizadas (Role, EmpresaDetalhada, Plano, …)
│   │   ├── schemas.ts                # Validações Zod (ApontamentoDiarioSchema, MedicaoSchema)
│   │   ├── calculador-avanco.ts      # Funções puras: desvio, CurvaS, deltaEfetivo, resumoObra
│   │   ├── apontamentos.ts           # Helpers de BD: getApontamentosDoDia, atualizarApontamento, …
│   │   ├── upload-helper.ts          # uploadFotoComRetry: compressão + retry exponencial, FormData por tentativa, AbortController 45s
│   │   ├── offline-db.ts             # Dexie schema v1: tabela pendingApontamentos (obraId, atividadeId, data, arquivoBase64, conflito)
│   │   ├── sync.ts                   # sincronizarPendentes, resolverConflito, contarPendentes
│   │   ├── query-hooks.ts            # React Query hooks: useStorageQuota, useApontamentosHoje
│   │   ├── super-admin.ts            # isSuperAdmin(userId) — usa service_role, queries system_admins
│   │   └── audit.ts                  # createAuditLog() — insert em audit_logs via service_role
│   └── obras/[id]/
│       ├── page.tsx                  # Config da obra (guards: admin/planejador apenas podem editar)
│       ├── linha-balanco/
│       │   ├── page.tsx              # Orquestrador (~1370 linhas)
│       │   │                         # podeEditar = role admin|planejador
│       │   │                         # modoLeitura = Definitiva OU !podeEditar
│       │   ├── utils/
│       │   │   ├── geradorCores.ts
│       │   │   └── helpers.ts
│       │   ├── hooks/
│       │   │   ├── useCalendarioAtividades.ts
│       │   │   ├── useAtividades.ts
│       │   │   ├── useVinculos.ts
│       │   │   ├── useDragAndDrop.ts
│       │   │   └── useConflitos.ts
│       │   └── components/
│       │       ├── GraficoLinhaBalanco.tsx
│       │       ├── BarraAtividade.tsx
│       │       ├── CalendarioHeader.tsx
│       │       ├── SVGVinculos.tsx
│       │       ├── LegendaCores.tsx
│       │       ├── ToolbarSuperior.tsx
│       │       ├── HeaderLinhaBalanco.tsx  # prop podeEditar oculta "Salvar Versão"
│       │       ├── BannersLinhaBalanco.tsx # prop podeEditar diferencia banners
│       │       ├── ContextMenu.tsx
│       │       ├── TooltipAtividade.tsx
│       │       ├── TelaCheia.tsx
│       │       └── modais/ (9 modais)
│       ├── dashboard/
│       │   ├── page.tsx
│       │   ├── hooks/
│       │   │   ├── useDashboardData.ts
│       │   │   ├── useKPIs.ts
│       │   │   ├── useEfetivo.ts
│       │   │   ├── useRealTimeApontamentos.ts  # polling 30s; retorna data.apontamentos do JSON
│       │   │   └── useKPIsTemporais.ts
│       │   ├── tabs/
│       │   │   ├── TabHome.tsx
│       │   │   ├── TabPlanejamento.tsx
│       │   │   ├── TabRealTime.tsx       # Apontamentos do dia em tempo real
│       │   │   └── TabRelatorios.tsx
│       │   ├── sections/ (SectionAlertas, SectionKPIs, SectionEfetivo, SectionAtencao, SectionCurvaS)
│       │   └── components/ (KpiCards, AlertasParalisadas, GridEfetivo, CurvaS, RowHighlight, TabelaAtencao, …)
│       ├── apontamentos/
│       │   ├── page.tsx              # Multi-card accordion, "Salvar tudo" flutuante, upload staged
│       │   │                         # podeEditar = role admin|planejador|operator
│       │   └── components/
│       │       └── UploadFoto.tsx
│       ├── criacao-em-lote/page.tsx  # Redirect se role viewer/operator
│       └── editar-bloco/[bloco]/page.tsx  # Redirect se role viewer/operator
├── components/
│   └── Header.tsx
├── lib/
│   └── supabase/client.ts
├── public/
│   └── icons/
│       ├── icon-192.png              # Ícone PWA 192×192 (fundo #1e3a5f, iniciais "MO")
│       └── icon-512.png              # Ícone PWA 512×512
├── __tests__/
│   └── calculadorAvanco.test.ts      # 17 testes Vitest
└── vitest.config.ts
```

### Fluxo de autenticação

1. `proxy.ts` intercepta todas as requisições (exceto `_next/*`, assets estáticos) — usa `getSession()` (cookie local, sem rede)
2. Rotas públicas: `/login`, `/signup`, `/auth/callback`
3. Usuário autenticado sem empresa → redirecionado para `/onboarding`
4. `AuthProvider` em `providers.tsx` carrega empresa via `/api/me` (server-side, service_role, sem RLS)
5. `useAuth()` expõe `{ user, empresa, role, isOwner, isSuperAdmin, subscriptionStatus, plano, loading, empresaFetched }` globalmente
6. Após criar empresa em `/onboarding/criar`: redireciona via `window.location.href = '/'` (hard reload — reinicializa AuthProvider)
7. Super Admin: acesso a `/super-admin/*` verificado via `isSuperAdmin(userId)` em cada API route e no layout server-side

### Cliente Supabase

- **Browser**: `lib/supabase/client.ts` — singleton via `createBrowserClient` do `@supabase/ssr`. **Todas** as páginas usam este singleton.
- **Server (proxy, callbacks, API routes)**: `createServerClient` do `@supabase/ssr` com cookies do request
- **Admin (service role)**: instância avulsa de `@supabase/supabase-js` criada dentro de API routes, nunca exposta ao browser

### Cache (React Query)

- `QueryClientProvider` em `providers.tsx` — staleTime 5 min, gcTime 10 min, retry 1, refetchOnWindowFocus false
- `useStorageQuota(empresaId)` em `app/lib/query-hooks.ts` — quota de storage; invalida após upload via `invalidateQueries`
- `useApontamentosHoje(obraId, data, enabled?)` em `app/lib/query-hooks.ts` — apontamentos do dia; invalida após salvar
- `queryClient.invalidateQueries` é o mecanismo de sincronização — **sem optimistic sync** (upload de foto não é reversível)
- `ReactQueryDevtools` disponível em desenvolvimento (painel no rodapé da página)
- IndexedDB via Dexie.js implementado em `app/lib/offline-db.ts` — offline queue de apontamentos com base64 de fotos, contagem de tentativas e flag de conflito

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
-- Planos de assinatura
planos (id uuid PK, nome text, max_users int, max_projects int,
        storage_limit bigint, features_enabled jsonb, ativo bool, created_at)

-- Multi-tenancy
empresas          (id uuid PK, nome text,
                   codigo_empresa text UNIQUE,  -- 8 dígitos, gerado no onboarding
                   cnpj text, endereco text, foto_logo_url text,
                   email_cadastro text, email_recuperacao text,
                   plan_id uuid FK planos,
                   subscription_status text CHECK('Active','Trial','Past_Due') DEFAULT 'Trial',
                   expires_at timestamptz,
                   created_at)

usuarios_empresas (user_id uuid FK auth.users, empresa_id uuid FK empresas,
                   role text CHECK('admin','planejador','operator','viewer'),
                   is_owner bool DEFAULT false,
                   created_at, UNIQUE(user_id, empresa_id))

-- Super Admin
system_admins (id uuid PK, user_id uuid FK auth.users UNIQUE, created_at)

-- Solicitações de acesso
join_requests (id uuid PK, user_id uuid FK auth.users, empresa_id uuid FK empresas,
               status text CHECK('pending','approved','rejected') DEFAULT 'pending',
               role text CHECK('planejador','operator','viewer') DEFAULT 'viewer',
               created_at, updated_at, UNIQUE(user_id, empresa_id))

-- Auditoria
audit_logs (id uuid PK, actor_id uuid FK auth.users, target_type text,
            target_id text, action text, details jsonb DEFAULT '{}',
            empresa_id uuid FK empresas, created_at)

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

### RBAC (4 roles)

| Ação | viewer | operator | planejador | admin |
|------|:------:|:--------:|:----------:|:-----:|
| Ler dados | ✅ | ✅ | ✅ | ✅ |
| Apontamentos (criar/editar) | ❌ | ✅ | ✅ | ✅ |
| Criar/editar obras e atividades | ❌ | ❌ | ✅ | ✅ |
| Arrastar linha de balanço | ❌ | ❌ | ✅ | ✅ |
| Gerenciar membros | ❌ | ❌ | ❌ | ✅ |
| Deletar empresa | ❌ | ❌ | ❌ | ✅ (is_owner) |

- **`podeEditar`** na linha de balanço = `role === 'admin' || role === 'planejador'`. Quando falso, `modoLeitura` é forçado (sem drag, sem context menu, sem salvar versão).
- **`podeEditar`** em apontamentos = `role === 'admin' || role === 'planejador' || role === 'operator'`
- **`is_owner`**: apenas um membro por empresa. Não pode ter sua role alterada nem ser removido. Único que pode deletar a empresa.
- **emails de membros**: nunca buscar via `users:user_id(email)` do PostgREST — `auth.users` está no schema `auth`, invisível à API pública. Usar `admin.auth.admin.listUsers()` com service_role e mapear emails via `Map`.

### Domínio

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
- **Não usar `users:user_id(email)` em joins PostgREST** — `auth.users` é inacessível via API pública; usar `admin.auth.admin.listUsers()` com service_role
- **Não omitir `type="button"`** em botões dentro de componentes — o padrão HTML é `type="submit"`, que pode causar submit acidental se houver um `<form>` ancestral
- **Não instalar `@ducanh2912/next-pwa`** nem outros wrappers PWA baseados em webpack — incompatível com Turbopack do Next.js 16 no Vercel; causa `WorkerError: Call retries were exceeded` no `npm run build`. Alternativas documentadas na memória do Claude (3 opções: `turbopack: {}`, SW manual, Serwist)

---

## Progresso / Changelog

### 2026-05-11 — Auditoria Técnica: PWA Core, Offline Sync e Correções Críticas

**Motivação**: auditoria identificou bugs críticos de upload, bug de permissão bloqueando planejador/operator, ausência completa de PWA e gaps de acessibilidade mobile. Implementadas correções e camada PWA/offline em 5 fases.

**Bug crítico de permissão — `assertRole` com role antiga**
- `app/lib/apontamentos.ts`: `assertRole` em `salvarApontamento` e `atualizarApontamento` verificava `['admin', 'editor']` — `editor` era o nome da role antes da migração Multi-Tenant (2026-05-10). Todos os usuários com role `planejador` e `operator` recebiam HTTP 400 ao salvar apontamentos. Corrigido para `['admin', 'planejador', 'operator']`.

**Correções críticas de upload (Fase 1)**
- `app/lib/upload-helper.ts`: `FormData` recriado dentro do loop de retry — body do `fetch` é consumido na primeira leitura e não pode ser relido; `AbortController` com timeout de 45s via `setTimeout` + `controller.abort()` para evitar requests penduradas indefinidamente
- `apontamentos/page.tsx`: `handleSalvarTodos` sequencializado — um `await salvarUm()` por vez em vez de `Promise.all`; evita acúmulo de blobs e crash em mobile com pouca RAM

**Correções de acessibilidade / CLS (Fase 2)**
- `UploadFoto.tsx`: todos os estados (enviando/sucesso/erro/preview/idle) envolvidos em `div.min-h-[72px]` — elimina CLS de até 40px entre estados; `role="button"` + `tabIndex={0}` + `onKeyDown` na área de drag-drop; "Tentar com outro arquivo" como `<button>` real com `min-h-[44px]`; alt texts descritivos
- `apontamentos/page.tsx`: toast com `role="region"` + `aria-live="assertive"` + `aria-atomic="true"`; botão fechar com `aria-label` e `w-10 h-10`; badges `py-0.5` → `py-1`; dupla invalidação redundante após `handleSalvarTodos` removida

**PWA Core (Fase 3)**
- `app/manifest.ts` (novo): manifest via App Router — nome, short_name, ícones, `display: standalone`, cores
- `app/layout.tsx`: `themeColor: '#1e3a5f'` e `appleWebApp` metadata adicionados
- `public/icons/icon-192.png` + `public/icons/icon-512.png` (novos): gerados via `sharp` com iniciais "MO" em fundo azul `#1e3a5f`
- `@ducanh2912/next-pwa` removido: incompatível com Turbopack do Next.js 16 no Vercel (`WorkerError: Call retries were exceeded`); service worker pendente

**Offline Sync com IndexedDB (Fase 4)**
- `app/lib/offline-db.ts` (novo): Dexie schema v1, tabela `pendingApontamentos` — campos: `obraId`, `atividadeId`, `data`, `efetivo_real`, `percentual_executado`, `status`, `arquivoBase64/Mime/Nome`, `createdAt`, `tentativas`, `erroUltimo`, `conflito`, `servidorVersion`
- `app/lib/sync.ts` (novo): `sincronizarPendentes(obraId)` lê fila do Dexie, POSTa ao servidor, deleta em sucesso, marca `conflito=true` em 409; `resolverConflito(localId, acao)` e `contarPendentes(obraId)`
- `app/hooks/useOnlineStatus.ts` (novo): `navigator.onLine` + eventos `online`/`offline`
- `apontamentos/page.tsx`: `salvarUm` detecta `!isOnline` e persiste no Dexie em vez de fazer fetch; banner âmbar fixo quando offline com contador de pendentes; `wasOfflineRef` detecta transição offline→online e dispara sync automático

**Reconciliação de Conflitos (Fase 5)**
- `app/api/obras/[id]/apontamentos/route.ts`: POST aceita `clientCreatedAt` no body; compara com `updated_at` do servidor; retorna HTTP 409 com `{ conflict: true, serverVersion }` se o registro foi modificado depois que o cliente foi offline
- `apontamentos/page.tsx`: modal de resolução — "Descartar minha versão" (delete do Dexie) ou "Sobrescrever servidor" (retry sem `clientCreatedAt`)
- **SQL pendente** (executar no Supabase SQL Editor para `updated_at` funcionar na detecção de conflito):
  ```sql
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
  CREATE OR REPLACE TRIGGER trg_apontamentos_diarios_updated_at BEFORE UPDATE ON apontamentos_diarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  ```

---

### 2026-05-09 — Upload Staged, Mobile-First Accordion e React Query Fase 1

**Motivação**: melhorar UX mobile, garantir que fotos sejam salvas vinculadas ao apontamento e adicionar camada de cache client-side.

**Upload Staged (foto só sobe ao salvar)**
- `app/api/medicoes/upload/route.ts`: extrai `apontamento_id` do FormData e vincula ao insert em `medicoes`
- `app/lib/upload-helper.ts` (novo): `uploadFotoComRetry` com compressão (`browser-image-compression`), retry exponencial (3 tentativas), validação magic bytes (JPEG/PNG/WebP), progresso 0–100%
- `app/obras/[id]/apontamentos/components/UploadFoto.tsx` (novo): componente controlado — exibe preview local (objectURL), não faz upload automático; parent gerencia arquivo pendente
- `apontamentos/page.tsx`: 5 registros de estado (`arquivosPendentes`, `uploadStatus`, `uploadProgresso`, `uploadErroMsg`, `fotoUrls`); upload acionado dentro de `handleSalvar` após POST do apontamento

**Mobile-First Accordion**
- `apontamentos/page.tsx` completamente redesenhado: cards em accordion (`expandidoCard: number | null`), um card aberto por vez
- Touch targets ≥ 44px (inputs), ≥ 48px (botões), font-size ≥ 16px (sem zoom iOS)
- Auto-colapso após salvar com sucesso (`setExpandidoCard(null)`)
- Sistema de toast fixo no topo (z-50): sucesso 3s / erro 4s
- Skeleton de carregamento com animação pulse
- Histórico dos últimos 7 dias colapsável (`historicoAberto`)

**Seção "Atrasadas"**
- Query busca atividades com `data_inicio <= hoje` (sem filtro de `data_fim`)
- Separa em `ativasHoje` (data_fim >= hoje) e `candidatasAtrasadas`
- Para candidatas: busca último apontamento de cada uma, filtra fora as com `percentual_executado = 100` ou `status = CONCLUIDA_NO_DIA`
- Resultado exibido em seção separada no topo da página de apontamentos

**React Query Fase 1**
- `@tanstack/react-query` instalado (v5.100.9)
- `app/lib/query-hooks.ts` (novo): `useStorageQuota` e `useApontamentosHoje`
- `app/providers.tsx` atualizado: `QueryClientProvider` + `ReactQueryDevtools` embutidos no `AuthProvider`
- `apontamentos/page.tsx`: migrado de fetch manual para hooks; race condition corrigida com flag `isSuccess` (pre-fill só roda quando `apontamentosCarregados === true` E `atividades.length > 0`)
- Dashboard **não alterado** — React Query Fase 3 é tarefa futura de alto risco

**Correções de Cold Start**
- `app/api/me/route.ts` (novo): carrega usuário + empresa via service_role sem depender de RLS no browser
- `providers.tsx`: `loadEmpresa` chama `/api/me` em vez de queries diretas ao Supabase no browser; failsafe de 8s mantido

---

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

### 2026-05-10 — Multi-Tenant RBAC, Onboarding, Admin Panel e Super Admin

**Motivação**: transformar o produto em plataforma SaaS completa com controle de acesso por papel, licenciamento, auditoria e painel administrativo global.

**Banco de dados (executado via Supabase SQL Editor)**
- Tabela `planos` (Free / Pro / Enterprise) com limites de usuários, obras e storage
- Tabela `system_admins` — lista de super admins do sistema
- Tabela `join_requests` — solicitações de entrada em empresa com status pending/approved/rejected
- Tabela `audit_logs` — log imutável de ações: create, update, delete, role_change, invite_sent, member_added, plan_change, status_change
- `empresas` expandida: `codigo_empresa` (8 dígitos únicos), `cnpj`, `endereco`, `foto_logo_url`, `subscription_status`, `plan_id`, `expires_at`
- `usuarios_empresas` expandida: `is_owner`, role migrado de `editor` → `planejador`, novo valor `operator`
- RLS policies para `join_requests`, `audit_logs`, `system_admins`
- Função `user_role_in_empresa(uuid)` SECURITY DEFINER para uso em policies

**Camada Auth**
- `app/lib/types.ts`: `Role = 'admin'|'planejador'|'operator'|'viewer'`, interfaces `Plano`, `EmpresaDetalhada`
- `app/api/me/route.ts`: expandido com `isOwner`, `isSuperAdmin`, `plano`
- `app/providers.tsx`: contexto expandido com `isOwner`, `isSuperAdmin`, `subscriptionStatus`, `plano`; redirect para `/onboarding` ao invés de `/setup`
- `app/lib/super-admin.ts`: `isSuperAdmin(userId)` — verificação via service_role, sem exposição ao browser
- `app/lib/audit.ts`: `createAuditLog()` — insert em audit_logs via service_role

**Onboarding**
- `app/onboarding/page.tsx`: 2 opções — Criar Empresa / Entrar em Empresa
- `app/onboarding/criar/page.tsx` + `app/api/onboarding/criar/route.ts`: cria empresa com `codigo_empresa` único, marca `is_owner=true`, grava audit_log
- `app/onboarding/buscar/page.tsx` + `app/api/onboarding/buscar/route.ts`: busca empresa por código de 8 dígitos, cria `join_request`

**Admin Panel**
- `app/admin/empresa/page.tsx`: exibe `codigo_empresa` copiável, plano, status; edição de dados; botão deletar (só is_owner)
- `app/admin/membros/page.tsx`: membros ativos (alterar role), solicitações pendentes (aprovar/rejeitar + escolher role), convidar por email
- `app/api/admin/empresa/route.ts`: PATCH + DELETE com guards
- `app/api/admin/membros/route.ts` + `app/api/admin/membros/[userId]/role/route.ts`: emails via `listUsers()`
- `app/api/admin/join-requests/route.ts` + `[id]/route.ts`: emails via `listUsers()`, approve/reject

**Super Admin Panel**
- `app/super-admin/layout.tsx`: guard server-side — redireciona para `/` se não for super admin
- Dashboard, Empresas, Planos, Usuários, Logs — todos com guard `isSuperAdmin`
- Emails de usuários via `admin.auth.admin.listUsers()` (não via join PostgREST)

**RBAC Guards**
- `linha-balanco/page.tsx`: `podeEditar = role admin|planejador`; `modoLeitura` unificado bloqueia drag, context menu e salvar versão para viewer/operator
- `BannersLinhaBalanco.tsx` + `HeaderLinhaBalanco.tsx`: prop `podeEditar` diferencia mensagem e oculta botões
- `obras/[id]/page.tsx`: editar obra, estrutura, feriados e foto bloqueados para viewer/operator
- `criacao-em-lote` + `editar-bloco`: redirect para `/obras/${obraId}` se não for admin/planejador
- `apontamentos/page.tsx`: `podeEditar = admin|planejador|operator`; viewer vê "somente leitura"
- API `/api/obras/[id]/apontamentos`: POST/PUT retorna 403 para viewer

**Correções pontuais**
- `print-color-adjust: exact` adicionado ao print da linha de balanço (blocos coloridos aparecem no PDF)
- Apontamentos: multi-card accordion, "Salvar tudo" flutuante, foto marca `formsModificados`
- Botão Voltar em apontamentos agora vai para o dashboard da obra (não para `/`)
- `useRealTimeApontamentos`: corrigido parse da resposta — API retorna `{ apontamentos }`, não array direto

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
